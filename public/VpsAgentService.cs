using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Diagnostics;
using System.ServiceProcess;
using System.Runtime.InteropServices;
using System.Net;
using System.DirectoryServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace InnovationWebWorks.VpsAgent
{
    public class VpsAgentService : ServiceBase
    {
        public const string SERVICE_NAME = "InnovationVpsAgent";
        public const string DISPLAY_NAME = "Innovation VPS 24/7 Enterprise Agent";
        public const string AGENT_VERSION = "2.1.0"; // first version that understands SET_AGENT_KEY
        public const string DESCRIPTION = "Innovation Web Works 24/7 VPS Telemetry and Real-Time Management Service";

        private static string _appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), @"InnovationWebWorks\VpsAgent");
        private static string _logFile = Path.Combine(_appDir, "agent.log");
        private static string _configFile = Path.Combine(_appDir, "agent-config.json");

        private static string _serverId = "auto";
        private static string _serverToken = "vps_sec_token_default";
        private static string _portalBase = "https://vps.innovationwebworks.in";
        private static int _intervalSeconds = 5;
        private static string _agentKey = "";
        private static readonly object _keyLogLock = new object();
        private static DateTime _lastMissingKeyLogUtc = DateTime.MinValue;

        private static List<Dictionary<string, object>> _activeProcessAlerts = new List<Dictionary<string, object>>();
        private static DateTime _lastOptimizedDate = DateTime.MinValue;
        private static DateTime _lastOptimizedAt = DateTime.MinValue;

        // Duplicate Session Guardian Settings (Keep Newest, Safe Old Session Logoff)
        private static string _duplicateSessionMode = "Enforce"; // "Enforce" (Auto-Logoff) by default!
        private static int _duplicateGracePeriodSeconds = 3;

        private Thread _workerThread;
        private Thread _longPollThread;
        private volatile bool _isRunning = false;

        private class TimeoutWebClient : WebClient
        {
            private readonly int _timeout;
            private readonly bool _keepAlive;
            public TimeoutWebClient(int timeoutMs = 8000, bool keepAlive = true) 
            { 
                _timeout = timeoutMs; 
                _keepAlive = keepAlive;
            }
            protected override WebRequest GetWebRequest(Uri address)
            {
                // Agent endpoints require the per-server key; skip the request when it is missing.
                bool isAgentEndpoint = IsAgentEndpoint(address);
                if (isAgentEndpoint && string.IsNullOrEmpty(_agentKey))
                {
                    LogMissingAgentKey(address.AbsolutePath);
                    throw new InvalidOperationException("Agent key missing; request to " + address.AbsolutePath + " skipped.");
                }

                var req = base.GetWebRequest(address);
                if (req != null)
                {
                    req.Timeout = _timeout;
                    var httpReq = req as HttpWebRequest;
                    if (httpReq != null)
                    {
                        if (isAgentEndpoint) httpReq.Headers["X-Agent-Key"] = _agentKey;
                        httpReq.ReadWriteTimeout = _timeout;
                        httpReq.KeepAlive = _keepAlive;
                        httpReq.Pipelined = false;
                        httpReq.ServicePoint.ConnectionLimit = 64;
                        httpReq.ServicePoint.Expect100Continue = false;
                        httpReq.ServicePoint.UseNagleAlgorithm = false;
                    }
                }
                return req;
            }

            protected override WebResponse GetWebResponse(WebRequest request)
            {
                try
                {
                    return base.GetWebResponse(request);
                }
                catch (WebException wex)
                {
                    LogIfUnauthorized(wex, request != null ? request.RequestUri : null);
                    throw;
                }
            }
        }

        private static bool IsAgentEndpoint(Uri address)
        {
            try
            {
                if (address == null || !address.IsAbsoluteUri) return false;
                Uri portal = new Uri(_portalBase);
                return string.Equals(address.Host, portal.Host, StringComparison.OrdinalIgnoreCase)
                    && address.AbsolutePath.StartsWith("/api/agent/", StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        // Logs a missing-key failure at most once per polling interval.
        private static void LogMissingAgentKey(string endpoint)
        {
            lock (_keyLogLock)
            {
                if ((DateTime.UtcNow - _lastMissingKeyLogUtc).TotalSeconds < Math.Max(1, _intervalSeconds)) return;
                _lastMissingKeyLogUtc = DateTime.UtcNow;
            }
            Log("Agent key missing, empty, or unreadable in agent-config.json; request skipped (" + endpoint + "). Will retry next interval.", "ERROR");
        }

        private static bool LogIfUnauthorized(WebException wex, Uri address)
        {
            var resp = wex != null ? wex.Response as HttpWebResponse : null;
            if (resp == null || resp.StatusCode != HttpStatusCode.Unauthorized) return false;
            Log("HTTP 401 Unauthorized from endpoint " + (address != null ? address.AbsolutePath : "(unknown)") + " (agent key rejected). Will retry next interval.", "ERROR");
            return true;
        }

        // Restrict the config file to SYSTEM and Administrators only (no inherited access).
        private static void ApplyConfigAcl(string path)
        {
            try
            {
                var sec = new FileSecurity();
                sec.SetAccessRuleProtection(true, false);
                sec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, AccessControlType.Allow));
                sec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), FileSystemRights.FullControl, AccessControlType.Allow));
                File.SetAccessControl(path, sec);
            }
            catch (Exception ex)
            {
                Log("Failed to restrict ACL on agent-config.json: " + ex.Message, "ERROR");
            }
        }

        public VpsAgentService()
        {
            this.ServiceName = SERVICE_NAME;
            this.CanStop = true;
            this.CanPauseAndContinue = false;
            this.CanShutdown = true;
            this.CanHandleSessionChangeEvent = true;
            this.AutoLog = false;
        }

        #region Service Lifecycle

        protected override void OnStart(string[] args)
        {
            Log("==========================================================================", "START");
            Log(" Innovation VPS 24/7 Enterprise Agent Service Starting (services.msc)...", "START");
            Log("==========================================================================", "START");

            LoadConfig();
            ConfigureShadowingPolicy(2);
            _isRunning = true;

            _workerThread = new Thread(WorkerLoop) { IsBackground = true, Name = "TelemetryWorker" };
            _workerThread.Start();

            _longPollThread = new Thread(LongPollLoop) { IsBackground = true, Name = "InstantPushListener" };
            _longPollThread.Start();

            Log("Service started successfully under NT AUTHORITY\\SYSTEM in Session 0.", "SUCCESS");
        }

        protected override void OnStop()
        {
            Log("Stopping Innovation VPS 24/7 Agent Service...", "INFO");
            _isRunning = false;

            try { if (_workerThread != null && _workerThread.IsAlive) _workerThread.Abort(); } catch { }
            try { if (_longPollThread != null && _longPollThread.IsAlive) _longPollThread.Abort(); } catch { }

            Log("Service stopped.", "INFO");
        }

        protected override void OnShutdown()
        {
            Log("System shutdown detected. Terminating cleanly.", "INFO");
            _isRunning = false;
            base.OnShutdown();
        }

        protected override void OnSessionChange(SessionChangeDescription changeDescription)
        {
            try
            {
                string reason = changeDescription.Reason.ToString();
                int sessId = changeDescription.SessionId;
                Log(string.Format("[EVENT] Terminal Session Change detected: Session {0} -> {1}", sessId, reason), "EVENT");

                // Evaluate duplicate session policy on new user login
                if (changeDescription.Reason == SessionChangeReason.SessionLogon)
                {
                    ThreadPool.QueueUserWorkItem((state) =>
                    {
                        try { HandleDuplicateSessionsForNewLogon(sessId); }
                        catch (Exception ex) { Log("Duplicate session guardian error: " + ex.Message, "WARN"); }
                    });
                }

                // Dispatch quick event to portal
                ThreadPool.QueueUserWorkItem((state) =>
                {
                    try
                    {
                        SendSessionEvent(sessId, reason);
                        Thread.Sleep(1500); // Wait 1.5s for session state to stabilize
                        SendTelemetry(true);
                    }
                    catch { }
                });
            }
            catch (Exception ex)
            {
                Log("Error in OnSessionChange: " + ex.Message, "WARN");
            }
        }

        #endregion

        #region Telemetry & Push Worker Loops

        private void WorkerLoop()
        {
            Log("Telemetry Worker Loop initiated. Cadence: " + _intervalSeconds + " seconds.", "INFO");

            // Initial telemetry sync immediately on startup
            try { SendTelemetry(false); } catch { }

            DateTime lastAutoUpdate = DateTime.UtcNow;

            while (_isRunning)
            {
                try
                {
                    Thread.Sleep(_intervalSeconds * 1000);
                    if (!_isRunning) break;

                    try
                    {
                        SendTelemetry(false);
                    }
                    catch (Exception exTele)
                    {
                        Log("Telemetry dispatch notice: " + exTele.Message, "WARN");
                    }

                    // Runaway Process / RAM Guard (Isolated background worker)
                    ThreadPool.QueueUserWorkItem((state) =>
                    {
                        try { RunawayProcessGuard(); } catch { }
                    });

                    // Continuous Watchdog: Enforce Single Active Session per user (Isolated background worker)
                    ThreadPool.QueueUserWorkItem((state) =>
                    {
                        try { ScanAndEnforceSingleActiveSession(); } catch { }
                    });

                    // Automated Midnight Server Cleanup (Runs daily at 03:00 AM local VPS time)
                    if (DateTime.Now.Hour == 3 && _lastOptimizedDate != DateTime.Today)
                    {
                        _lastOptimizedDate = DateTime.Today;
                        ThreadPool.QueueUserWorkItem((state) =>
                        {
                            try
                            {
                                Log("Initiating scheduled 03:00 AM Midnight Server Auto-Optimization...", "JOB");
                                ExecuteServerOptimization();
                                _lastOptimizedAt = DateTime.Now;
                            }
                            catch (Exception ex)
                            {
                                Log("Midnight optimization error: " + ex.Message, "ERROR");
                            }
                        });
                    }

                    // Check for updates every 30 minutes
                    if ((DateTime.UtcNow - lastAutoUpdate).TotalMinutes >= 30)
                    {
                        CheckAndApplyAutoUpdate();
                        lastAutoUpdate = DateTime.UtcNow;
                    }
                }
                catch (ThreadAbortException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Log("Telemetry worker warning: " + ex.Message, "WARN");
                }
            }
        }

        private void LongPollLoop()
        {
            Log("0-Second Instant Push Listener initiated (Long-Polling Pipe).", "INFO");

            while (_isRunning)
            {
                try
                {
                    ListenForJobs();
                }
                catch (ThreadAbortException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Log("Long-polling listener error: " + ex.Message, "WARN");
                    Thread.Sleep(3000);
                }
            }
        }

        #endregion

        #region Telemetry Gathering & Network Dispatch

        private static void SendTelemetry(bool isQuick)
        {
            try
            {
                ConfigureSecurityProtocols();

                var payload = new Dictionary<string, object>();
                payload["serverId"] = _serverId;
                payload["serverToken"] = _serverToken;
                payload["agentVersion"] = AGENT_VERSION;
                payload["cpuUsage"] = GetCpuUsage();
                payload["ram"] = GetRamStats();
                payload["disks"] = GetDiskStats();
                payload["physicalDisks"] = GetPhysicalDiskStats();
                payload["occupiedDrives"] = GetOccupiedDrives();
                payload["tallyVersions"] = GetInstalledTallyVersions();
                payload["processAlerts"] = _activeProcessAlerts;
                if (_lastOptimizedAt > DateTime.MinValue) payload["lastOptimizedAt"] = _lastOptimizedAt.ToString("yyyy-MM-dd HH:mm:ss");

                var hardware = GetHardwareSpecs();
                if (hardware != null)
                {
                    payload["hardware"] = hardware;
                    if (hardware.ContainsKey("specs")) payload["specs"] = hardware["specs"];
                }

                var sessions = GetUserSessions();
                payload["activeUsers"] = sessions["activeUsers"];
                payload["activeUsersCount"] = sessions["activeCount"];
                payload["disconnectedUsers"] = sessions["disconnectedUsers"];
                payload["disconnectedUsersCount"] = sessions["disconnectedCount"];
                payload["detailedSessions"] = sessions["detailedSessions"];

                var userLists = GetServerLocalUsers();
                payload["allServerUsers"] = userLists["all"];
                payload["disabledServerUsers"] = userLists["disabled"];

                payload["uptime"] = "Active";
                payload["timestamp"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

                var serializer = new JavaScriptSerializer();
                serializer.MaxJsonLength = 10485760; // 10MB
                string jsonBody = serializer.Serialize(payload);

                string apiUrl = _portalBase.TrimEnd('/') + "/api/agent/telemetry";

                using (var wc = new TimeoutWebClient(8000))
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                    wc.Headers["X-Server-Token"] = _serverToken;
                    wc.Headers["User-Agent"] = "InnovationVpsServiceAgent/3.0";

                    string responseStr = wc.UploadString(apiUrl, "POST", jsonBody);

                    string typeStr = isQuick ? "INSTANT-SYNC" : "SYNC";
                    Log(string.Format("Telemetry synced ({0}). Active: {1} | Disconnected: {2} | Accounts: {3}",
                        typeStr,
                        sessions["activeCount"],
                        sessions["disconnectedCount"],
                        ((List<string>)userLists["all"]).Count), typeStr);

                    // Check for any returned pending jobs
                    if (!string.IsNullOrEmpty(responseStr))
                    {
                        try
                        {
                            var respObj = serializer.Deserialize<Dictionary<string, object>>(responseStr);
                            if (respObj != null && respObj.ContainsKey("pendingJobs"))
                            {
                                var jobs = respObj["pendingJobs"] as System.Collections.ArrayList;
                                if (jobs != null && jobs.Count > 0)
                                {
                                    foreach (var j in jobs)
                                    {
                                        var jobDict = j as Dictionary<string, object>;
                                        if (jobDict != null)
                                        {
                                            ThreadPool.QueueUserWorkItem((state) =>
                                            {
                                                try { ExecuteJob((Dictionary<string, object>)state); }
                                                catch (Exception ex) { Log("Worker job error: " + ex.Message, "ERROR"); }
                                            }, jobDict);
                                        }
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Warning: Telemetry send failed (" + ex.Message + ")", "WARN");
            }
        }

        private static void SendSessionEvent(int sessionId, string reason)
        {
            try
            {
                ConfigureSecurityProtocols();
                string eventUrl = _portalBase.TrimEnd('/') + "/api/agent/session-event";

                var payload = new Dictionary<string, object>
                {
                    { "serverId", _serverId },
                    { "serverToken", _serverToken },
                    { "sessionId", sessionId },
                    { "reason", reason },
                    { "timestamp", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                };

                var serializer = new JavaScriptSerializer();
                string json = serializer.Serialize(payload);

                using (var wc = new TimeoutWebClient(8000))
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                    wc.UploadString(eventUrl, "POST", json);
                }
            }
            catch { }
        }

        private static void ListenForJobs()
        {
            ConfigureSecurityProtocols();
            string listenUrl = string.Format("{0}/api/agent/listen-jobs?serverId={1}&serverToken={2}",
                _portalBase.TrimEnd('/'),
                Uri.EscapeDataString(_serverId),
                Uri.EscapeDataString(_serverToken));

            if (string.IsNullOrEmpty(_agentKey))
            {
                LogMissingAgentKey("/api/agent/listen-jobs");
                Thread.Sleep(Math.Max(1, _intervalSeconds) * 1000);
                return;
            }

            var req = (HttpWebRequest)WebRequest.Create(listenUrl);
            req.Method = "GET";
            req.Timeout = 35000;
            req.Headers["X-Agent-Key"] = _agentKey;
            req.Headers["X-Server-Token"] = _serverToken;
            req.Headers["X-Server-Id"] = _serverId;
            req.UserAgent = "InnovationVpsServiceAgent/3.0";

            try
            {
                using (var resp = req.GetResponse())
                using (var stream = resp.GetResponseStream())
                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    string json = reader.ReadToEnd();
                    if (!string.IsNullOrEmpty(json))
                    {
                        var serializer = new JavaScriptSerializer();
                        var data = serializer.Deserialize<Dictionary<string, object>>(json);
                        if (data != null && data.ContainsKey("pendingJobs"))
                        {
                            var jobs = data["pendingJobs"] as System.Collections.ArrayList;
                            if (jobs != null && jobs.Count > 0)
                            {
                                Log(string.Format("[*] [INSTANT PUSH] Received {0} jobs in 0-second realtime pipe!", jobs.Count), "INSTANT");
                                foreach (var j in jobs)
                                {
                                    var jobDict = j as Dictionary<string, object>;
                                    if (jobDict != null)
                                    {
                                        ThreadPool.QueueUserWorkItem((state) =>
                                        {
                                            try { ExecuteJob((Dictionary<string, object>)state); }
                                            catch (Exception ex) { Log("Push job error: " + ex.Message, "ERROR"); }
                                        }, jobDict);
                                    }
                                }
                                // Immediately trigger updated telemetry
                                SendTelemetry(true);
                            }
                        }
                    }
                }
            }
            catch (WebException wex)
            {
                if (LogIfUnauthorized(wex, req.RequestUri))
                {
                    // Keep running; retry on the next polling interval
                    Thread.Sleep(Math.Max(1, _intervalSeconds) * 1000);
                }
                // Timeout is normal for long-polling, simply continue
                else if (wex.Status != WebExceptionStatus.Timeout)
                {
                    Thread.Sleep(2000);
                }
            }
        }

        #endregion

        #region Job Execution Engine (Passwords, Status Toggle, Logoff, Provisioning)

        private static void ExecuteJob(Dictionary<string, object> job)
        {
            string jobId = job.ContainsKey("id") ? Convert.ToString(job["id"]) : Guid.NewGuid().ToString();
            string action = job.ContainsKey("action") ? Convert.ToString(job["action"]) : "PROVISION_TALLY_USER";
            string rawUsername = job.ContainsKey("username") ? Convert.ToString(job["username"]) : "";
            string username = CleanUsername(rawUsername);

            Log(string.Format("Executing Remote Job: Action = {0} | User = {1} | Job ID = {2}", action, username, jobId), "JOB");

            string resultUrl = _portalBase.TrimEnd('/') + "/api/agent/job-result";

            // Hardening: reject unsafe usernames (e.g. containing ' or ") before any process is started
            if (!string.IsNullOrEmpty(username) && !IsSafeUsername(username))
            {
                Log(string.Format("Rejected job {0}: username failed allowlist validation.", jobId), "WARN");
                ReportJobResult(resultUrl, jobId, "FAILED", "Invalid username.", "SYSTEM");
                return;
            }

            // Immediately mark job as PROCESSING so neither this server nor any reboot re-executes it repeatedly
            ReportJobResult(resultUrl, jobId, "PROCESSING", "Job started execution on Windows VPS", username);

            // ACTION 0: GET_AGENT_LOG (Remote Diagnostic Retrieval)
            if (action == "GET_AGENT_LOG")
            {
                try
                {
                    string logFile = Path.Combine(_appDir, "agent.log");
                    if (!File.Exists(logFile)) logFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent.log");
                    string content = "";
                    if (File.Exists(logFile))
                    {
                        var lines = File.ReadAllLines(logFile);
                        int take = Math.Min(100, lines.Length);
                        var lastLines = new string[take];
                        Array.Copy(lines, lines.Length - take, lastLines, 0, take);
                        content = string.Join("\r\n", lastLines);
                    }
                    else
                    {
                        content = "agent.log file not found on VPS.";
                    }
                    ReportJobResult(resultUrl, jobId, "COMPLETED", content, "SYSTEM");
                }
                catch (Exception exLog)
                {
                    ReportJobResult(resultUrl, jobId, "FAILED", exLog.Message, "SYSTEM");
                }
                return;
            }

            // ACTION 1: CHANGE_USER_PASSWORD
            if (action == "CHANGE_USER_PASSWORD")
            {
                try
                {
                    string newPass = job.ContainsKey("newPassword") ? Convert.ToString(job["newPassword"]) : (job.ContainsKey("password") ? Convert.ToString(job["password"]) : "");
                    if (string.IsNullOrEmpty(newPass)) throw new Exception("New password cannot be empty.");
                    if (string.IsNullOrEmpty(username)) throw new Exception("Username is required.");

                    bool changed = false;
                    string lastError = "";

                    // Method 1: ADSI WinNT DirectoryEntry
                    try
                    {
                        using (var de = new DirectoryEntry(string.Format("WinNT://{0}/{1},user", Environment.MachineName, username)))
                        {
                            de.Invoke("SetPassword", new object[] { newPass });
                            de.CommitChanges();
                            changed = true;
                            Log("Password changed successfully via ADSI for '" + username + "'.", "SUCCESS");
                        }
                    }
                    catch (Exception ex)
                    {
                        lastError = ex.Message;
                    }

                    // Method 2: net.exe user fallback
                    if (!changed)
                    {
                        int exitCode = RunProcess("net.exe", BuildArgs("user", username, newPass));
                        if (exitCode == 0)
                        {
                            changed = true;
                            Log("Password changed successfully via net.exe for '" + username + "'.", "SUCCESS");
                        }
                    }

                    if (!changed)
                    {
                        throw new Exception("Failed to change password: " + lastError + " (Ensure complexity rules are met: min 6-8 chars with uppercase, lowercase, numbers)");
                    }

                    ReportJobResult(resultUrl, jobId, "COMPLETED", "Password successfully updated on Windows VPS for user '" + username + "'.", username);
                }
                catch (Exception ex)
                {
                    Log("Password change failed for '" + username + "': " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 2: TOGGLE_USER_STATUS (Enable / Disable Windows Account)
            if (action == "TOGGLE_USER_STATUS")
            {
                try
                {
                    string targetStatus = job.ContainsKey("userStatus") ? Convert.ToString(job["userStatus"]) : (job.ContainsKey("status") ? Convert.ToString(job["status"]) : "");
                    bool shouldDisable = targetStatus.Equals("Disabled", StringComparison.OrdinalIgnoreCase) || (job.ContainsKey("enabled") && Convert.ToBoolean(job["enabled"]) == false);

                    bool changed = false;

                    // Method 1: ADSI UserFlags
                    try
                    {
                        using (var de = new DirectoryEntry(string.Format("WinNT://{0}/{1},user", Environment.MachineName, username)))
                        {
                            int userFlags = (int)de.Properties["UserFlags"].Value;
                            const int ADS_UF_ACCOUNTDISABLE = 2;

                            if (shouldDisable)
                                de.Properties["UserFlags"].Value = userFlags | ADS_UF_ACCOUNTDISABLE;
                            else
                                de.Properties["UserFlags"].Value = userFlags & ~ADS_UF_ACCOUNTDISABLE;

                            de.CommitChanges();
                            changed = true;
                        }
                    }
                    catch { }

                    if (!changed)
                    {
                        // Method 2: net.exe user /active:yes|no fallback
                        string activeArg = shouldDisable ? "/active:no" : "/active:yes";
                        RunProcess("net.exe", BuildArgs("user", username, activeArg));
                    }

                    string msg = string.Format("Account '{0}' successfully {1} on Windows VPS.", username, shouldDisable ? "DISABLED" : "ENABLED");
                    Log(msg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", msg, username);
                }
                catch (Exception ex)
                {
                    Log("User toggle failed for '" + username + "': " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 3: TERMINATE_SESSION (Force Logoff User Session)
            if (action == "TERMINATE_SESSION")
            {
                try
                {
                    int sessId = 0;
                    if (job.ContainsKey("sessionId") && int.TryParse(Convert.ToString(job["sessionId"]), out sessId))
                    {
                        // Direct session ID termination
                    }

                    // Terminate by session ID if valid
                    if (sessId > 0)
                    {
                        Log(string.Format("Terminating Session ID {0}...", sessId), "JOB");
                        WTSLogoffSession(IntPtr.Zero, sessId, false);
                        RunProcess("logoff.exe", sessId.ToString());
                        RunProcess("rwinsta.exe", sessId.ToString());
                    }

                    // Also search session for user if username given
                    if (!string.IsNullOrEmpty(username))
                    {
                        int foundId = FindSessionIdForUser(username);
                        if (foundId > 0)
                        {
                            Log(string.Format("Found active session {0} for user '{1}'. Logging off...", foundId, username), "JOB");
                            WTSLogoffSession(IntPtr.Zero, foundId, false);
                            RunProcess("logoff.exe", foundId.ToString());
                            RunProcess("rwinsta.exe", foundId.ToString());
                            sessId = foundId;
                        }

                        // Terminate any remaining processes belonging to this user
                        KillUserProcesses(username);
                    }

                    string msg = string.Format("Session {0} ({1}) logged off successfully.", sessId > 0 ? sessId.ToString() : "auto-detected", username);
                    Log(msg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", msg, username);
                }
                catch (Exception ex)
                {
                    Log("Session logoff failed: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 4: PROVISION_TALLY_USER (Zero-Trust Storage & NTFS Isolation)
            if (action == "PROVISION_TALLY_USER")
            {
                try
                {
                    string company = job.ContainsKey("companyName") ? Convert.ToString(job["companyName"]) : "ClientCompany";
                    string pass = job.ContainsKey("password") ? Convert.ToString(job["password"]) : "Pass@1234";
                    string rawDrive = job.ContainsKey("drive") ? Convert.ToString(job["drive"]) : "C:";

                    string driveLetter = rawDrive.Replace("Drive", "").Trim().TrimEnd('\\');
                    if (!driveLetter.EndsWith(":")) driveLetter += ":";
                    if (!IsSafeDriveRoot(driveLetter)) throw new Exception("Invalid drive.");

                    string sanitizedFolder = company.Trim().Replace(" ", "_");
                    foreach (char c in Path.GetInvalidFileNameChars()) sanitizedFolder = sanitizedFolder.Replace(c.ToString(), "");

                    string companyRoot = Path.Combine(driveLetter + "\\", sanitizedFolder);
                    string tallyDir = Path.Combine(companyRoot, "Tally");
                    string dataDir = Path.Combine(companyRoot, "Data");
                    string exportDir = Path.Combine(companyRoot, "Export");
                    string tdlDir = Path.Combine(companyRoot, "tdl");
                    string langDir = Path.Combine(companyRoot, "lang");
                    string backupDir = Path.Combine(companyRoot, "Backup");
                    string docsDir = Path.Combine(companyRoot, "Documents");

                    // 1. Create Directory Structure (Only create Data and Export on first-time setup)
                    bool companyAlreadyExists = Directory.Exists(companyRoot);
                    bool iniAlreadyExists = File.Exists(Path.Combine(tallyDir, "tally.ini")) || File.Exists(Path.Combine(companyRoot, "tally.ini"));

                    Directory.CreateDirectory(companyRoot);
                    Directory.CreateDirectory(tallyDir);
                    if (!companyAlreadyExists || !iniAlreadyExists)
                    {
                        Directory.CreateDirectory(dataDir);
                        Directory.CreateDirectory(exportDir);
                    }
                    Directory.CreateDirectory(tdlDir);
                    Directory.CreateDirectory(langDir);
                    Directory.CreateDirectory(backupDir);
                    Directory.CreateDirectory(docsDir);

                    // 2. Create / Update Windows Local User
                    bool userCreated = false;
                    try
                    {
                        using (var parent = new DirectoryEntry("WinNT://" + Environment.MachineName))
                        {
                            DirectoryEntry userEntry = null;
                            try { userEntry = parent.Children.Find(username, "User"); } catch { }

                            if (userEntry != null)
                            {
                                userEntry.Invoke("SetPassword", new object[] { pass });
                                userEntry.Properties["Description"].Value = "Tally Client - " + company;
                                userEntry.CommitChanges();
                            }
                            else
                            {
                                var newUser = parent.Children.Add(username, "User");
                                newUser.Invoke("SetPassword", new object[] { pass });
                                newUser.Properties["Description"].Value = "Tally Client - " + company;
                                newUser.Properties["FullName"].Value = company;
                                newUser.CommitChanges();
                            }
                            userCreated = true;
                        }
                    }
                    catch { }

                    if (!userCreated)
                    {
                        RunProcess("net.exe", BuildArgs("user", username, pass, "/add", "/comment:Tally Client - " + company, "/expires:never", "/y"));
                        RunProcess("net.exe", BuildArgs("user", username, pass, "/y"));
                    }

                    // 3. Add to Remote Desktop Users
                    RunProcess("net.exe", BuildArgs("localgroup", "Remote Desktop Users", username, "/add"));

                    // 4. Apply Drive-Level & Folder-Level Zero-Trust NTFS Security Isolation
                    ApplyDriveLevelNtfsIsolation(driveLetter, username);

                    try
                    {
                        var dInfo = new DirectoryInfo(companyRoot);
                        var dSec = dInfo.GetAccessControl();
                        var inheritFlags = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
                        var propFlags = PropagationFlags.None;

                        if (!dSec.AreAccessRulesProtected)
                        {
                            dSec.SetAccessRuleProtection(true, false); // Disable inheritance, strip unmanaged users
                            dSec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                            dSec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                        }
                        
                        try
                        {
                            dSec.AddAccessRule(new FileSystemAccessRule("superclient", FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                        }
                        catch { }

                        try
                        {
                            dSec.AddAccessRule(new FileSystemAccessRule(username, FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                        }
                        catch (Exception exUserAcl)
                        {
                            Log("Notice assigning user NTFS ACL: " + exUserAcl.Message, "WARN");
                        }

                        dInfo.SetAccessControl(dSec);

                        try
                        {
                            RunProcess("icacls.exe", BuildArgs(companyRoot, "/grant", "superclient:(OI)(CI)F", "/q"));
                        }
                        catch { }
                    }
                    catch (Exception ex)
                    {
                        Log("Notice configuring NTFS ACL: " + ex.Message, "WARN");
                    }

                    // 5. Clone Tally Template & Configure tally.ini
                    try
                    {
                        bool alreadyHasTally = File.Exists(Path.Combine(companyRoot, "tally.exe")) || File.Exists(Path.Combine(tallyDir, "tally.exe"));
                        if (!alreadyHasTally)
                        {
                            string reqTallyVer = job.ContainsKey("tallyVersion") ? Convert.ToString(job["tallyVersion"]).Trim() : "";
                            string customTpl = null;
                            if (!string.IsNullOrEmpty(reqTallyVer))
                            {
                                string cPath = Path.Combine(@"C:\TallyVersions", reqTallyVer);
                                if (Directory.Exists(cPath) && File.Exists(Path.Combine(cPath, "tally.exe")))
                                {
                                    customTpl = cPath;
                                }
                            }
                            CloneTallyTemplate(companyRoot, customTpl);
                        }
                        else
                        {
                            Log("Tally executable already exists in company directory. Skipping clone to preserve client data.", "PROVISION");
                        }

                        // Configure tally.ini across all discovered locations in company directory
                        List<string> targetInis = new List<string>
                        {
                            Path.Combine(tallyDir, "tally.ini"),
                            Path.Combine(companyRoot, "tally.ini")
                        };

                        try
                        {
                            if (Directory.Exists(companyRoot))
                            {
                                foreach (var f in Directory.GetFiles(companyRoot, "tally*.ini", SearchOption.AllDirectories))
                                {
                                    if (!targetInis.Contains(f))
                                        targetInis.Add(f);
                                }
                            }
                        }
                        catch { }

                        foreach (var ini in targetInis)
                        {
                            SetTallyIniPaths(ini, companyRoot, dataDir, exportDir);
                            LockDownTallyIniPermissions(ini, username);
                        }
                    }
                    catch (Exception exClone)
                    {
                        Log("Notice during Tally template cloning: " + exClone.Message, "WARN");
                    }

                    // 6. TSplus Floating Panel & Application Configuration
                    try
                    {
                        ConfigureTSplusApplication(company, sanitizedFolder, username, driveLetter, companyRoot, tallyDir);
                    }
                    catch (Exception exTSplus)
                    {
                        Log("Notice during TSplus configuration: " + exTSplus.Message, "WARN");
                    }

                    string msg = string.Format("Client '{0}' ({1}) successfully provisioned on drive {2} with Zero-Trust NTFS and TSplus Floating Panel.", company, username, driveLetter);
                    Log(msg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", msg, username);
                }
                catch (Exception ex)
                {
                    Log("User provisioning failed: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 5: UPDATE_AGENT (Trigger Instant Self-Update)
            if (action == "UPDATE_AGENT")
            {
                ReportJobResult(resultUrl, jobId, "COMPLETED", "Agent auto-update acknowledged.", username);
                CheckAndApplyAutoUpdate();
                return;
            }

            // ACTION 5b: SET_AGENT_KEY (Install per-server Agent_Key; the key is never logged or echoed)
            if (action == "SET_AGENT_KEY")
            {
                string keyErr;
                try
                {
                    string newKey = job.ContainsKey("agentKey") && job["agentKey"] != null ? Convert.ToString(job["agentKey"]).Trim() : "";
                    keyErr = InstallAgentKey(newKey);
                }
                catch (Exception)
                {
                    keyErr = "SET_AGENT_KEY failed; old key kept.";
                }
                if (keyErr == null)
                {
                    Log("Agent key installed via SET_AGENT_KEY.", "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", "Agent key installed", "SYSTEM");
                }
                else
                {
                    Log("SET_AGENT_KEY failed: " + keyErr, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", keyErr, "SYSTEM");
                }
                return;
            }

            // ACTION 6: INITIALIZE_DISK / CREATE_PARTITION (Online, Initialize GPT if raw, Create Partition from Unallocated Space & Format NTFS)
            if (action == "INITIALIZE_DISK" || action == "CREATE_PARTITION")
            {
                try
                {
                    int diskNum = 1;
                    if (job.ContainsKey("diskNumber")) diskNum = Convert.ToInt32(job["diskNumber"]);
                    string reqLetter = "D";
                    if (job.ContainsKey("driveLetter")) reqLetter = Convert.ToString(job["driveLetter"]).Replace(":", "").Replace("Drive", "").Trim().ToUpper();
                    string reqLabel = "Data_" + reqLetter;
                    if (job.ContainsKey("label") && !string.IsNullOrEmpty(Convert.ToString(job["label"])))
                        reqLabel = Convert.ToString(job["label"]).Trim();

                    double sizeGb = 0;
                    if (job.ContainsKey("sizeGB"))
                    {
                        try { sizeGb = Convert.ToDouble(job["sizeGB"]); } catch { }
                    }

                    Log(string.Format("Executing INITIALIZE_DISK: Disk {0} -> Drive {1}: (Label: {2}, Size: {3} GB)", diskNum, reqLetter, reqLabel, sizeGb > 0 ? sizeGb.ToString() : "All Unallocated"), "DISK");

                    string scriptPath = Path.Combine(Path.GetTempPath(), "init_disk_" + Guid.NewGuid().ToString("N") + ".ps1");
                    string dpScriptPath = Path.Combine(Path.GetTempPath(), "dp_" + Guid.NewGuid().ToString("N") + ".txt");

                    string psContent = 
                        "$num = " + diskNum + ";\r\n" +
                        "$letter = '" + reqLetter + "';\r\n" +
                        "$label = '" + reqLabel + "';\r\n" +
                        "$sizeGb = " + sizeGb.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";\r\n" +
                        "$success = $false;\r\n" +
                        "$errMsg = '';\r\n\r\n" +
                        "# 1. If CD-ROM holds $letter, move it to Z: or unmount\r\n" +
                        "try {\r\n" +
                        "  Get-WmiObject -Class Win32_Volume -Filter 'DriveType = 5' -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter -and $_.DriveLetter.ToUpper().StartsWith($letter) } | ForEach-Object { $_.DriveLetter = 'Z:'; $_.Put() | Out-Null; }\r\n" +
                        "  Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 'CD-ROM' -and $_.DriveLetter -eq $letter } | ForEach-Object { & mountvol \"$letter`:\" /d }\r\n" +
                        "} catch {}\r\n\r\n" +
                        "# 2. Bring disk online and initialize GPT if raw\r\n" +
                        "try {\r\n" +
                        "  Set-Disk -Number $num -IsOffline $false -IsReadOnly $false -ErrorAction SilentlyContinue;\r\n" +
                        "  Initialize-Disk -Number $num -PartitionStyle GPT -ErrorAction SilentlyContinue;\r\n" +
                        "} catch {}\r\n\r\n" +
                        "# 3. Create partition from unallocated space without drive letter first (prevents Windows Explorer raw format popup)\r\n" +
                        "try {\r\n" +
                        "  if ($sizeGb -gt 0) {\r\n" +
                        "    $bytes = [long]($sizeGb * 1024 * 1024 * 1024);\r\n" +
                        "    $part = New-Partition -DiskNumber $num -Size $bytes -AssignDriveLetter:$false -ErrorAction Stop;\r\n" +
                        "  } else {\r\n" +
                        "    $part = New-Partition -DiskNumber $num -UseMaximumSize -AssignDriveLetter:$false -ErrorAction Stop;\r\n" +
                        "  }\r\n" +
                        "  Format-Volume -Partition $part -FileSystem NTFS -NewFileSystemLabel $label -Confirm:$false -ErrorAction Stop | Out-Null;\r\n" +
                        "  Set-Partition -InputObject $part -NewDriveLetter $letter -ErrorAction Stop;\r\n" +
                        "  $success = (Test-Path \"$letter`:\");\r\n" +
                        "} catch {\r\n" +
                        "  $errMsg = $_.Exception.Message;\r\n" +
                        "  # 4. Diskpart fallback (format BEFORE assign letter prevents Explorer format popup)\r\n" +
                        "  try {\r\n" +
                        "    $dpSizeLine = if ($sizeGb -gt 0) { 'create partition primary size=' + [int]($sizeGb * 1024) } else { 'create partition primary' };\r\n" +
                        "    $dpLines = @('select disk ' + $num, 'online disk noerr', 'attributes disk clear readonly noerr', $dpSizeLine, 'format fs=ntfs quick label=\"' + $label + '\"', 'assign letter=' + $letter);\r\n" +
                        "    [System.IO.File]::WriteAllLines('" + dpScriptPath.Replace("\\", "\\\\") + "', $dpLines);\r\n" +
                        "    & diskpart.exe /s '" + dpScriptPath.Replace("\\", "\\\\") + "' *>$null;\r\n" +
                        "    Remove-Item '" + dpScriptPath.Replace("\\", "\\\\") + "' -Force -ErrorAction SilentlyContinue;\r\n" +
                        "    $success = (Test-Path \"$letter`:\");\r\n" +
                        "  } catch { $errMsg += ' | Diskpart: ' + $_.Exception.Message; }\r\n" +
                        "}\r\n\r\n" +
                        "if ($success) { Write-Output ('SUCCESS:' + $letter); } else { Write-Output ('FAILED:' + $errMsg); }\r\n";

                    File.WriteAllText(scriptPath, psContent);
                    string output = RunProcessWithOutput("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"");
                    try { File.Delete(scriptPath); } catch { }

                    if (output.Contains("SUCCESS"))
                    {
                        try { ApplyDriveLevelNtfsIsolation(reqLetter, null); } catch { }
                        string msg = string.Format("Disk {0} unallocated space successfully formatted, zero-trust secured, and mounted as Drive {1}: ({2}, NTFS).", diskNum, reqLetter, reqLabel);
                        Log(msg, "SUCCESS");
                        ReportJobResult(resultUrl, jobId, "COMPLETED", msg, "SYSTEM");
                    }
                    else
                    {
                        string failMsg = string.Format("Failed to initialize Disk {0}. Output: {1}", diskNum, output.Trim());
                        Log(failMsg, "ERROR");
                        ReportJobResult(resultUrl, jobId, "FAILED", failMsg, "SYSTEM");
                    }
                }
                catch (Exception ex)
                {
                    Log("INITIALIZE_DISK exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, "SYSTEM");
                }
                return;
            }

            // ACTION 7: EXTEND_DRIVE / EXTEND_VOLUME (Resize existing NTFS partition using unallocated space on the same disk)
            if (action == "EXTEND_DRIVE" || action == "EXTEND_VOLUME" || action == "RESIZE_PARTITION")
            {
                try
                {
                    int diskNum = 0;
                    if (job.ContainsKey("diskNumber")) diskNum = Convert.ToInt32(job["diskNumber"]);
                    string reqLetter = "E";
                    if (job.ContainsKey("driveLetter")) reqLetter = Convert.ToString(job["driveLetter"]).Replace(":", "").Replace("Drive", "").Trim().ToUpper();

                    double addSizeGb = 0;
                    if (job.ContainsKey("sizeGB"))
                    {
                        try { addSizeGb = Convert.ToDouble(job["sizeGB"]); } catch { }
                    }

                    Log(string.Format("Executing EXTEND_DRIVE: Drive {0}: on Disk {1} (Add Size: {2} GB)", reqLetter, diskNum, addSizeGb > 0 ? addSizeGb.ToString() : "All Available Unallocated"), "DISK");

                    string scriptPath = Path.Combine(Path.GetTempPath(), "extend_disk_" + Guid.NewGuid().ToString("N") + ".ps1");
                    string dpScriptPath = Path.Combine(Path.GetTempPath(), "dp_ext_" + Guid.NewGuid().ToString("N") + ".txt");

                    string psContent = 
                        "$letter = '" + reqLetter + "';\r\n" +
                        "$diskNum = " + diskNum + ";\r\n" +
                        "$addGb = " + addSizeGb.ToString(System.Globalization.CultureInfo.InvariantCulture) + ";\r\n" +
                        "$success = $false;\r\n" +
                        "$errMsg = '';\r\n\r\n" +
                        "try {\r\n" +
                        "  $part = Get-Partition -DriveLetter $letter -ErrorAction Stop;\r\n" +
                        "  $supp = Get-PartitionSupportedSize -DriveLetter $letter -ErrorAction Stop;\r\n" +
                        "  if ($addGb -gt 0) {\r\n" +
                        "    $targetBytes = [long]($part.Size + ($addGb * 1024 * 1024 * 1024));\r\n" +
                        "    if ($targetBytes -gt $supp.SizeMax) { $targetBytes = $supp.SizeMax; }\r\n" +
                        "    Resize-Partition -DriveLetter $letter -Size $targetBytes -ErrorAction Stop;\r\n" +
                        "  } else {\r\n" +
                        "    Resize-Partition -DriveLetter $letter -Size $supp.SizeMax -ErrorAction Stop;\r\n" +
                        "  }\r\n" +
                        "  $success = $true;\r\n" +
                        "} catch {\r\n" +
                        "  $errMsg = $_.Exception.Message;\r\n" +
                        "  # Diskpart extend fallback\r\n" +
                        "  try {\r\n" +
                        "    $dpLines = if ($addGb -gt 0) {\r\n" +
                        "      @('select volume ' + $letter, 'extend size=' + [int]($addGb * 1024) + ' noerr')\r\n" +
                        "    } else {\r\n" +
                        "      @('select volume ' + $letter, 'extend noerr')\r\n" +
                        "    };\r\n" +
                        "    [System.IO.File]::WriteAllLines('" + dpScriptPath.Replace("\\", "\\\\") + "', $dpLines);\r\n" +
                        "    & diskpart.exe /s '" + dpScriptPath.Replace("\\", "\\\\") + "' *>$null;\r\n" +
                        "    Remove-Item '" + dpScriptPath.Replace("\\", "\\\\") + "' -Force -ErrorAction SilentlyContinue;\r\n" +
                        "    $success = $true;\r\n" +
                        "  } catch { $errMsg += ' | Diskpart: ' + $_.Exception.Message; }\r\n" +
                        "}\r\n\r\n" +
                        "if ($success) { Write-Output ('SUCCESS:' + $letter); } else { Write-Output ('FAILED:' + $errMsg); }\r\n";

                    File.WriteAllText(scriptPath, psContent);
                    string output = RunProcessWithOutput("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"");
                    try { File.Delete(scriptPath); } catch { }

                    if (output.Contains("SUCCESS"))
                    {
                        string msg = string.Format("Drive {0}: successfully extended using unallocated space on Disk {1}.", reqLetter, diskNum);
                        Log(msg, "SUCCESS");
                        ReportJobResult(resultUrl, jobId, "COMPLETED", msg, "SYSTEM");
                    }
                    else
                    {
                        string failMsg = string.Format("Failed to extend Drive {0}:. Output: {1}", reqLetter, output.Trim());
                        Log(failMsg, "ERROR");
                        ReportJobResult(resultUrl, jobId, "FAILED", failMsg, "SYSTEM");
                    }
                }
                catch (Exception ex)
                {
                    Log("EXTEND_DRIVE exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, "SYSTEM");
                }
                return;
            }

            // ACTION 8: LOCKDOWN_DRIVE (Enforce Zero-Trust NTFS Root Lockdown on Data Drive)
            if (action == "LOCKDOWN_DRIVE" || action == "HARDEN_DRIVE")
            {
                try
                {
                    string reqLetter = "E";
                    if (job.ContainsKey("driveLetter")) reqLetter = Convert.ToString(job["driveLetter"]).Replace(":", "").Replace("Drive", "").Trim().ToUpper();

                    if (reqLetter == "C")
                    {
                        ReportJobResult(resultUrl, jobId, "FAILED", "System drive C: is protected and cannot be locked down.", "SYSTEM");
                        return;
                    }

                    ApplyDriveLevelNtfsIsolation(reqLetter, null);
                    string msg = string.Format("Zero-Trust NTFS security isolation enforced on Drive {0}:. Broad Groups (Users/Everyone) stripped from root.", reqLetter);
                    Log(msg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", msg, "SYSTEM");
                }
                catch (Exception ex)
                {
                    Log("LOCKDOWN_DRIVE exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, "SYSTEM");
                }
                return;
            }

            // ACTION 9: EXPORT_CLIENT_DATA (1-Click Migration Phase 1: Archive, Hash & Chunked Upload)
            if (action == "EXPORT_CLIENT_DATA")
            {
                try
                {
                    string migrationId = job.ContainsKey("migrationId") ? Convert.ToString(job["migrationId"]) : Guid.NewGuid().ToString();
                    string uploadUrl = job.ContainsKey("uploadUrl") ? Convert.ToString(job["uploadUrl"]) : (_portalBase.TrimEnd('/') + "/api/agent/migration/upload-chunk");
                    string company = job.ContainsKey("companyName") ? Convert.ToString(job["companyName"]) : "";
                    string rawDrive = job.ContainsKey("drive") ? Convert.ToString(job["drive"]) : "D:";
                    string driveLetter = rawDrive.Replace(":", "").Replace("Drive", "").Trim().ToUpper();

                    Log(string.Format("Starting Client Data Export for '{0}' (Company: {1}) from Drive {2}: [Migration ID: {3}]", username, company, driveLetter, migrationId), "JOB");

                    // 1. Force Logoff active session for username so file locks are released
                    ForceLogoffUserSession(username);

                    // 2. Temporarily disable local user so they cannot reconnect during migration
                    try
                    {
                        if (!IsSafeUsername(username)) throw new Exception("Invalid username.");
                        // Username travels base64-encoded inside an -EncodedCommand script, never as raw command text
                        string b64User = Convert.ToBase64String(Encoding.UTF8.GetBytes(username));
                        ExecutePowerShellEncoded("$n = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('" + b64User + "')); Disable-LocalUser -Name $n -ErrorAction SilentlyContinue");
                        RunProcess("net.exe", BuildArgs("user", username, "/active:no"));
                    }
                    catch { }

                    // 3. Locate client folder on drive
                    string clientDir = LocateClientDataDirectory(driveLetter, username, company);
                    if (string.IsNullOrEmpty(clientDir) || !Directory.Exists(clientDir))
                    {
                        throw new DirectoryNotFoundException(string.Format("Client directory could not be found on Drive {0}: for user '{1}' / company '{2}'.", driveLetter, username, company));
                    }

                    // 4. Create ZIP archive in %TEMP%
                    string tempZip = Path.Combine(Path.GetTempPath(), string.Format("mig_exp_{0}_{1}.zip", migrationId, Guid.NewGuid().ToString("N").Substring(0, 8)));
                    try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }

                    Log(string.Format("Compressing directory '{0}' into archive '{1}'...", clientDir, tempZip), "INFO");
                    ZipFile.CreateFromDirectory(clientDir, tempZip, CompressionLevel.Fastest, false);

                    long fileLength = new FileInfo(tempZip).Length;
                    if (fileLength == 0) throw new Exception("Generated export zip archive is 0 bytes.");

                    // 5. Calculate SHA-256 Hash
                    string sha256Hex = ComputeFileSha256(tempZip);
                    Log(string.Format("Export ZIP created: {0} bytes. SHA-256: {1}", fileLength, sha256Hex), "INFO");

                    // 6. High-Performance Multi-Worker Parallel Upload (3 concurrent streams with Keep-Alive & TCP optimization)
                    int chunkSize = 4 * 1024 * 1024;
                    int totalChunks = (int)Math.Ceiling((double)fileLength / chunkSize);
                    if (totalChunks <= 0) totalChunks = 1;

                    Log(string.Format("Export ZIP created: {0} bytes ({1} MB), {2} chunks. Starting parallel upload (3 concurrent workers)...", 
                        fileLength, (fileLength / (1024.0 * 1024.0)).ToString("0.0"), totalChunks), "INFO");

                    var chunkList = new List<int>();
                    for (int i = 0; i < totalChunks; i++) chunkList.Add(i);

                    var uploadErrors = new ConcurrentBag<string>();
                    int completedCount = 0;
                    var parallelOptions = new ParallelOptions { MaxDegreeOfParallelism = 3 };

                    Parallel.ForEach(chunkList, parallelOptions, (chunkIdx, loopState) =>
                    {
                        if (!uploadErrors.IsEmpty)
                        {
                            loopState.Stop();
                            return;
                        }

                        try
                        {
                            long offset = (long)chunkIdx * (long)chunkSize;
                            long remaining = fileLength - offset;
                            int currentChunkSize = (int)Math.Min((long)chunkSize, remaining);
                            byte[] chunkData = new byte[currentChunkSize];

                            using (var fs = new FileStream(tempZip, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                            {
                                fs.Seek(offset, SeekOrigin.Begin);
                                int totalRead = 0;
                                while (totalRead < currentChunkSize)
                                {
                                    int r = fs.Read(chunkData, totalRead, currentChunkSize - totalRead);
                                    if (r == 0) break;
                                    totalRead += r;
                                }
                            }

                            string chunkShaHex = ComputeBufferSha256(chunkData);

                            string chunkUrl = string.Format("{0}?migrationId={1}&chunkIndex={2}&totalChunks={3}&sha256={4}&chunkSha={5}&username={6}&company={7}",
                                uploadUrl,
                                Uri.EscapeDataString(migrationId),
                                chunkIdx,
                                totalChunks,
                                Uri.EscapeDataString(sha256Hex),
                                Uri.EscapeDataString(chunkShaHex),
                                Uri.EscapeDataString(username),
                                Uri.EscapeDataString(company));

                            bool chunkSuccess = false;
                            string lastError = "";

                            for (int attempt = 0; attempt < 5; attempt++)
                            {
                                if (!uploadErrors.IsEmpty) return;
                                try
                                {
                                    // 25s timeout with keepAlive: false guarantees fresh connection per chunk attempt, preventing stale socket hangs
                                    using (var wc = new TimeoutWebClient(25000, false))
                                    {
                                        wc.Proxy = null;
                                        ConfigureSecurityProtocols();
                                        wc.Headers[HttpRequestHeader.ContentType] = "application/octet-stream";
                                        wc.Headers["User-Agent"] = "InnovationVpsAgent/3.0";
                                        byte[] respBytes = wc.UploadData(chunkUrl, "POST", chunkData);
                                        string respStr = Encoding.UTF8.GetString(respBytes);
                                        if (respStr.Contains("\"success\":true"))
                                        {
                                            chunkSuccess = true;
                                            int c = Interlocked.Increment(ref completedCount);
                                            if (c % 5 == 0 || c == totalChunks)
                                            {
                                                Log(string.Format("Migration upload progress: {0}/{1} chunks transmitted ({2}%)", c, totalChunks, (int)((c * 100.0) / totalChunks)), "INFO");
                                            }
                                            break;
                                        }
                                        else
                                        {
                                            lastError = respStr;
                                            Log(string.Format("Chunk {0}/{1} rejected by portal: {2}", chunkIdx + 1, totalChunks, respStr), "WARN");
                                        }
                                    }
                                }
                                catch (Exception ex)
                                {
                                    lastError = ex.InnerException != null ? (ex.Message + " -> " + ex.InnerException.Message) : ex.Message;
                                    Log(string.Format("Chunk {0}/{1} upload retry {2}/5: {3}", chunkIdx + 1, totalChunks, attempt + 1, lastError), "WARN");
                                }
                                Thread.Sleep(500 * (attempt + 1));
                            }

                            if (!chunkSuccess)
                            {
                                string err = string.Format("Failed to upload chunk {0}/{1} to portal after 5 attempts. Last error: {2}", chunkIdx + 1, totalChunks, lastError);
                                uploadErrors.Add(err);
                                loopState.Stop();
                            }
                        }
                        catch (Exception exChunk)
                        {
                            uploadErrors.Add(string.Format("Fatal chunk {0} read/upload exception: {1}", chunkIdx + 1, exChunk.Message));
                            loopState.Stop();
                        }
                    });

                    if (!uploadErrors.IsEmpty)
                    {
                        throw new Exception(string.Join("; ", uploadErrors.ToArray()));
                    }

                    // 7. Source directory remains intact and disabled for zero-risk safety
                    Log(string.Format("Source directory safely preserved: {0}", clientDir), "SUCCESS");

                    // 8. Clean up temp zip
                    try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }

                    var exportDetails = new Dictionary<string, object>
                    {
                        { "migrationId", migrationId },
                        { "sha256", sha256Hex },
                        { "fileSizeBytes", fileLength },
                        { "totalChunks", totalChunks }
                    };

                    string successMsg = string.Format("Client data exported ({0} MB, {1} chunks). SHA-256: {2}. Source preserved as backup.", (fileLength / (1024.0 * 1024.0)).ToString("0.0"), totalChunks, sha256Hex);
                    Log(successMsg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", successMsg, username, exportDetails);
                }
                catch (Exception ex)
                {
                    Log("EXPORT_CLIENT_DATA exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 10: IMPORT_CLIENT_DATA (1-Click Migration Phase 2: Download, Verify, Unzip & Zero-Trust Provision)
            if (action == "IMPORT_CLIENT_DATA")
            {
                try
                {
                    string migrationId = job.ContainsKey("migrationId") ? Convert.ToString(job["migrationId"]) : Guid.NewGuid().ToString();
                    string downloadUrl = job.ContainsKey("downloadUrl") ? Convert.ToString(job["downloadUrl"]) : (_portalBase.TrimEnd('/') + "/api/agent/migration/download-chunk");
                    string company = job.ContainsKey("companyName") ? Convert.ToString(job["companyName"]) : "";
                    string rawDrive = job.ContainsKey("targetDrive") ? Convert.ToString(job["targetDrive"]) : (job.ContainsKey("drive") ? Convert.ToString(job["drive"]) : "E:");
                    string driveLetter = rawDrive.Replace(":", "").Replace("Drive", "").Trim().ToUpper();
                    string password = job.ContainsKey("password") ? Convert.ToString(job["password"]) : "Pass#123";
                    string expectedSha = job.ContainsKey("sha256") ? Convert.ToString(job["sha256"]).Trim().ToLower() : "";

                    Log(string.Format("Starting Client Data Import for '{0}' (Company: {1}) onto Drive {2}: [Migration ID: {3}]", username, company, driveLetter, migrationId), "JOB");

                    // 1. Verify target drive exists
                    string driveRoot = driveLetter + @":\";
                    if (!Directory.Exists(driveRoot))
                    {
                        throw new DirectoryNotFoundException(string.Format("Target Drive {0}: does not exist on this VPS.", driveLetter));
                    }

                    // 2. Download ZIP archive from portal
                    string tempZip = Path.Combine(Path.GetTempPath(), string.Format("mig_imp_{0}_{1}.zip", migrationId, Guid.NewGuid().ToString("N").Substring(0, 8)));
                    try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }

                    string directUrl = string.Format("{0}?migrationId={1}&full=1", downloadUrl, Uri.EscapeDataString(migrationId));
                    Log(string.Format("Downloading data archive from {0}...", directUrl), "INFO");

                    bool downloadSuccess = false;
                    string downloadError = "";
                    for (int dAttempt = 0; dAttempt < 3; dAttempt++)
                    {
                        try
                        {
                            try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }
                            using (var wc = new TimeoutWebClient(600000, false))
                            {
                                ConfigureSecurityProtocols();
                                wc.Headers["User-Agent"] = "InnovationVpsAgent/3.0";
                                wc.DownloadFile(directUrl, tempZip);
                            }
                            if (File.Exists(tempZip) && new FileInfo(tempZip).Length > 0)
                            {
                                downloadSuccess = true;
                                break;
                            }
                        }
                        catch (Exception exDl)
                        {
                            downloadError = exDl.Message;
                            Log(string.Format("Download attempt {0}/3 failed: {1}", dAttempt + 1, exDl.Message), "WARN");
                            Thread.Sleep(3000);
                        }
                    }

                    if (!downloadSuccess || !File.Exists(tempZip) || new FileInfo(tempZip).Length == 0)
                    {
                        throw new Exception(string.Format("Downloaded migration archive failed or empty after 3 attempts. Last error: {0}", downloadError));
                    }

                    // 3. Verify SHA-256 Checksum
                    string actualSha = ComputeFileSha256(tempZip);
                    if (!string.IsNullOrEmpty(expectedSha) && !string.Equals(actualSha, expectedSha, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new Exception(string.Format("Integrity check failed! Expected SHA-256: {0}, Actual: {1}", expectedSha, actualSha));
                    }
                    Log("SHA-256 integrity check verified successfully.", "SUCCESS");

                    // 4. Target Directory
                    string cleanComp = CleanDirectoryName(company);
                    if (string.IsNullOrEmpty(cleanComp)) cleanComp = username;
                    string targetDir = Path.Combine(driveRoot, cleanComp);
                    if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

                    // 5. Extract Archive (with FileShare.ReadWrite and lock-retry to tolerate background virus scanner)
                    Log(string.Format("Extracting archive into '{0}'...", targetDir), "INFO");
                    bool extractSuccess = false;
                    string extractErr = "";
                    for (int exAttempt = 0; exAttempt < 5; exAttempt++)
                    {
                        try
                        {
                            using (var zipStream = new FileStream(tempZip, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                            using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                            {
                                foreach (ZipArchiveEntry entry in archive.Entries)
                                {
                                    string destPath = Path.Combine(targetDir, entry.FullName);
                                    string destDir = Path.GetDirectoryName(destPath);
                                    if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir)) Directory.CreateDirectory(destDir);
                                    if (!string.IsNullOrEmpty(entry.Name))
                                    {
                                        entry.ExtractToFile(destPath, true);
                                    }
                                }
                            }
                            extractSuccess = true;
                            break;
                        }
                        catch (IOException ioEx)
                        {
                            extractErr = ioEx.Message;
                            Log(string.Format("Archive lock retry {0}/5: {1}", exAttempt + 1, ioEx.Message), "WARN");
                            Thread.Sleep(1500);
                        }
                    }
                    if (!extractSuccess)
                    {
                        throw new Exception(string.Format("Failed to extract archive after 5 attempts. Last error: {0}", extractErr));
                    }

                    // 6. Fix tally.ini Data path if present
                    try
                    {
                        string iniPath = Path.Combine(targetDir, "tally.ini");
                        if (File.Exists(iniPath))
                        {
                            string iniText = File.ReadAllText(iniPath);
                            string dataPath = Path.Combine(targetDir, "Data");
                            iniText = System.Text.RegularExpressions.Regex.Replace(iniText, @"(?m)^(\s*Data\s*=\s*).*$", string.Format("$1{0}", dataPath));
                            File.WriteAllText(iniPath, iniText);
                            Log(string.Format("Updated tally.ini Data path to: {0}", dataPath), "INFO");
                        }
                    }
                    catch (Exception ex)
                    {
                        Log("Notice updating tally.ini: " + ex.Message, "WARN");
                    }

                    // 7. Create/Update Local Windows User
                    CreateOrUpdateWindowsUser(username, password, company);

                    // 8. Apply Zero-Trust NTFS Isolation on Drive & Directory
                    ApplyDriveLevelNtfsIsolation(driveLetter, username);
                    GrantFolderFullControl(targetDir, username);

                    // 9. Recreate TSplus Floating Panel / Shortcut
                    try
                    {
                        ConfigureTSplusApplication(company, cleanComp, username, driveLetter, targetDir, Path.Combine(targetDir, "Tally"));
                    }
                    catch (Exception exTs)
                    {
                        Log("Notice configuring TSplus on target: " + exTs.Message, "WARN");
                    }

                    // 10. Clean up temp zip
                    try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }

                    string finishMsg = string.Format("Client '{0}' ({1}) successfully migrated to Drive {2}: with Zero-Trust NTFS.", username, company, driveLetter);
                    Log(finishMsg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", finishMsg, username, new Dictionary<string, object>
                    {
                        { "migrationId", migrationId },
                        { "targetDir", targetDir },
                        { "driveLetter", driveLetter }
                    });
                }
                catch (Exception ex)
                {
                    Log("IMPORT_CLIENT_DATA exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 11: OPTIMIZE_SERVER (Midnight Cleanup & Auto-Optimize)
            if (action == "OPTIMIZE_SERVER")
            {
                try
                {
                    Log("Executing Server Auto-Optimization & Junk Cleanup...", "JOB");
                    string optResult = ExecuteServerOptimization();
                    Log("Server Auto-Optimization completed: " + optResult, "SUCCESS");
                    _lastOptimizedAt = DateTime.Now;
                    ReportJobResult(resultUrl, jobId, "COMPLETED", optResult, "SYSTEM");
                }
                catch (Exception ex)
                {
                    Log("OPTIMIZE_SERVER exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, "SYSTEM");
                }
                return;
            }

            // ACTION 12: CONFIGURE_SHADOW_POLICY (Remote Desktop Session Shadowing)
            if (action == "CONFIGURE_SHADOW_POLICY")
            {
                try
                {
                    int shadowLevel = job.ContainsKey("shadowLevel") ? Convert.ToInt32(job["shadowLevel"]) : 2;
                    ConfigureShadowingPolicy(shadowLevel);
                    string msg = string.Format("Remote Desktop Session Shadowing configured to Level {0} (Full Control, Immediate Assist).", shadowLevel);
                    Log(msg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", msg, "SYSTEM");
                }
                catch (Exception ex)
                {
                    Log("CONFIGURE_SHADOW_POLICY exception: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, "SYSTEM");
                }
                return;
            }

            // ACTION 13: CAPTURE_SESSION_SCREEN (Instant Live Screen Snapshot - Zero Login Required)
            if (action == "CAPTURE_SESSION_SCREEN")
            {
                try
                {
                    int targetSessionId = 1;
                    if (job.ContainsKey("sessionId") && job["sessionId"] != null)
                    {
                        int.TryParse(Convert.ToString(job["sessionId"]), out targetSessionId);
                    }

                    Log(string.Format("Executing CAPTURE_SESSION_SCREEN for Session {0} ({1})...", targetSessionId, username), "JOB");

                    string base64Image = CaptureSessionScreenAsBase64(targetSessionId);

                    if (string.IsNullOrEmpty(base64Image))
                    {
                        throw new Exception("Screen capture returned empty data. Session may be disconnected, locked, or idle.");
                    }

                    Log(string.Format("Screen capture succeeded for Session {0} ({1} bytes base64)", targetSessionId, base64Image.Length), "SUCCESS");

                    var customRes = new Dictionary<string, object>
                    {
                        { "sessionId", targetSessionId },
                        { "screenBase64", base64Image },
                        { "capturedAt", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                    };

                    ReportJobResult(resultUrl, jobId, "COMPLETED", "Screen captured successfully", username, customRes);
                }
                catch (Exception ex)
                {
                    Log("CAPTURE_SESSION_SCREEN error: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, username);
                }
                return;
            }

            // ACTION 14: CONFIGURE_DUPLICATE_SESSION_POLICY (Keep Newest, Safe Old Session Logoff)
            if (action == "CONFIGURE_DUPLICATE_SESSION_POLICY")
            {
                try
                {
                    string mode = job.ContainsKey("mode") ? Convert.ToString(job["mode"]) : "Audit";
                    if (job.ContainsKey("gracePeriodSeconds"))
                    {
                        int.TryParse(Convert.ToString(job["gracePeriodSeconds"]), out _duplicateGracePeriodSeconds);
                        if (_duplicateGracePeriodSeconds < 5) _duplicateGracePeriodSeconds = 15;
                    }
                    _duplicateSessionMode = mode;
                    string msg = string.Format("Duplicate session policy updated to: Mode={0}, GracePeriod={1}s", _duplicateSessionMode, _duplicateGracePeriodSeconds);
                    Log(msg, "SUCCESS");
                    ReportJobResult(resultUrl, jobId, "COMPLETED", msg, "SYSTEM");
                }
                catch (Exception ex)
                {
                    Log("CONFIGURE_DUPLICATE_SESSION_POLICY error: " + ex.Message, "ERROR");
                    ReportJobResult(resultUrl, jobId, "FAILED", ex.Message, "SYSTEM");
                }
                return;
            }
        }

        private static void ReportJobResult(string url, string jobId, string status, string message, string username, Dictionary<string, object> customDetails = null)
        {
            try
            {
                ConfigureSecurityProtocols();
                var detailsDict = new Dictionary<string, object>
                {
                    { "username", username },
                    { "updatedAt", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                };
                if (customDetails != null)
                {
                    foreach (var kvp in customDetails) detailsDict[kvp.Key] = kvp.Value;
                }

                var payload = new Dictionary<string, object>
                {
                    { "serverId", _serverId },
                    { "jobId", jobId },
                    { "status", status },
                    { "message", message },
                    { "details", detailsDict }
                };

                var serializer = new JavaScriptSerializer();
                string json = serializer.Serialize(payload);

                using (var wc = new TimeoutWebClient(8000))
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                    wc.UploadString(url, "POST", json);
                }
            }
            catch { }
        }

        private static string ComputeFileSha256(string filePath)
        {
            for (int retry = 0; retry < 5; retry++)
            {
                try
                {
                    using (var sha = SHA256.Create())
                    using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    {
                        byte[] hash = sha.ComputeHash(fs);
                        var sb = new StringBuilder();
                        for (int i = 0; i < hash.Length; i++) sb.Append(hash[i].ToString("x2"));
                        return sb.ToString().ToLower();
                    }
                }
                catch (IOException)
                {
                    Thread.Sleep(1000);
                }
            }
            using (var sha = SHA256.Create())
            using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                byte[] hash = sha.ComputeHash(fs);
                var sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++) sb.Append(hash[i].ToString("x2"));
                return sb.ToString().ToLower();
            }
        }

        private static string ComputeBufferSha256(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(data);
                var sb = new StringBuilder();
                for (int i = 0; i < hash.Length; i++) sb.Append(hash[i].ToString("x2"));
                return sb.ToString().ToLower();
            }
        }

        private static string LocateClientDataDirectory(string driveLetter, string username, string company)
        {
            string driveRoot = driveLetter + @":\";
            if (!Directory.Exists(driveRoot)) return null;

            string cleanComp = CleanDirectoryName(company);
            if (!string.IsNullOrEmpty(cleanComp))
            {
                string p1 = Path.Combine(driveRoot, cleanComp);
                if (Directory.Exists(p1)) return p1;
            }

            if (!string.IsNullOrEmpty(username))
            {
                string p2 = Path.Combine(driveRoot, username);
                if (Directory.Exists(p2)) return p2;
            }

            try
            {
                string[] dirs = Directory.GetDirectories(driveRoot);
                for (int i = 0; i < dirs.Length; i++)
                {
                    string dName = Path.GetFileName(dirs[i]).ToLower();
                    if (dName == "$recycle.bin" || dName == "system volume information") continue;
                    if (dName.Contains("_migrated_backup_")) continue;
                    if (!string.IsNullOrEmpty(username) && dName.Contains(username.ToLower())) return dirs[i];
                    if (!string.IsNullOrEmpty(cleanComp) && dName.Contains(cleanComp.ToLower())) return dirs[i];
                }

                // Fallback: Check if a _MIGRATED_BACKUP_ directory exists from a prior attempt
                string searchPattern = string.IsNullOrEmpty(cleanComp) ? ("*" + username + "*_MIGRATED_BACKUP_*") : ("*" + cleanComp + "*_MIGRATED_BACKUP_*");
                string[] backupDirs = Directory.GetDirectories(driveRoot, searchPattern);
                if (backupDirs.Length > 0)
                {
                    Array.Sort(backupDirs);
                    string newestBackup = backupDirs[backupDirs.Length - 1];
                    string restoredPath = Path.Combine(driveRoot, string.IsNullOrEmpty(cleanComp) ? username : cleanComp);
                    if (!Directory.Exists(restoredPath))
                    {
                        Directory.Move(newestBackup, restoredPath);
                        Log(string.Format("Restored previous migration backup '{0}' to '{1}' for export retry.", newestBackup, restoredPath), "INFO");
                        return restoredPath;
                    }
                    return newestBackup;
                }
            }
            catch { }

            return null;
        }

        private static void ForceLogoffUserSession(string username)
        {
            if (string.IsNullOrEmpty(username)) return;
            try
            {
                string outStr = ExecutePowerShell("quser");
                string[] lines = outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < lines.Length; i++)
                {
                    string line = lines[i].Trim();
                    if (line.ToLower().Contains(username.ToLower()))
                    {
                        var parts = System.Text.RegularExpressions.Regex.Split(line, @"\s+");
                        for (int p = 1; p < parts.Length; p++)
                        {
                            int sid;
                            if (int.TryParse(parts[p], out sid))
                            {
                                Log(string.Format("Force logging off active session ID {0} for user '{1}'...", sid, username), "INFO");
                                RunProcess("logoff.exe", sid.ToString());
                                break;
                            }
                        }
                    }
                }
            }
            catch { }
        }

        private static string ExecuteServerOptimization()
        {
            int sessionsCleaned = 0;
            long junkBytesDeleted = 0;

            try
            {
                string outStr = ExecutePowerShell("quser");
                string[] lines = outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < lines.Length; i++)
                {
                    string line = lines[i];
                    if (line.Contains("Disc") && (line.Contains("1+") || line.Contains("2+") || line.Contains("3+") || line.Contains("4+") || line.Contains("5+")))
                    {
                        var parts = System.Text.RegularExpressions.Regex.Split(line.Trim(), @"\s+");
                        for (int p = 1; p < parts.Length; p++)
                        {
                            int sid;
                            if (int.TryParse(parts[p], out sid))
                            {
                                RunProcess("logoff.exe", sid.ToString());
                                sessionsCleaned++;
                                break;
                            }
                        }
                    }
                }
            }
            catch { }

            string[] tempDirs = new string[] {
                Path.GetTempPath(),
                @"C:\Windows\Temp",
                @"C:\ProgramData\Microsoft\Windows\WER\ReportQueue",
                @"C:\ProgramData\Microsoft\Windows\WER\ReportArchive",
                @"C:\Windows\System32\spool\PRINTERS"
            };

            for (int t = 0; t < tempDirs.Length; t++)
            {
                string d = tempDirs[t];
                if (Directory.Exists(d))
                {
                    try
                    {
                        string[] files = Directory.GetFiles(d, "*.*", SearchOption.TopDirectoryOnly);
                        for (int f = 0; f < files.Length; f++)
                        {
                            try
                            {
                                var fi = new FileInfo(files[f]);
                                if ((DateTime.Now - fi.LastWriteTime).TotalHours > 24)
                                {
                                    long sz = fi.Length;
                                    fi.Delete();
                                    junkBytesDeleted += sz;
                                }
                            }
                            catch { }
                        }
                    }
                    catch { }
                }
            }

            try
            {
                ExecutePowerShell("Optimize-Volume -DriveLetter C -ReTrim -ErrorAction SilentlyContinue");
                foreach (var d in DriveInfo.GetDrives())
                {
                    if (d.IsReady && d.DriveType == DriveType.Fixed && d.Name.ToUpper().StartsWith("C") == false)
                    {
                        string ltr = d.Name.Replace(":\\", "").Replace(":", "").Trim();
                        if (ltr.Length == 1 && char.IsLetter(ltr[0]))
                            ExecutePowerShellEncoded(string.Format("Optimize-Volume -DriveLetter {0} -ReTrim -ErrorAction SilentlyContinue", ltr));
                    }
                }
            }
            catch { }

            double mbFreed = junkBytesDeleted / (1024.0 * 1024.0);
            return string.Format("Cleaned {0} stale disconnected session(s). Purged {1} MB junk temp files. Executed SSD ReTrim on all volumes.", sessionsCleaned, mbFreed.ToString("0.0"));
        }

        private static void RunawayProcessGuard()
        {
            try
            {
                var alerts = new List<Dictionary<string, object>>();
                Process[] procs = Process.GetProcesses();
                for (int i = 0; i < procs.Length; i++)
                {
                    try
                    {
                        var p = procs[i];
                        string name = p.ProcessName.ToLower();
                        if (name == "tally" || name == "tally72" || name == "tally9" || name == "tallyprime")
                        {
                            long ramMB = p.WorkingSet64 / (1024 * 1024);
                            if (ramMB > 3500)
                            {
                                if (p.PriorityClass != ProcessPriorityClass.BelowNormal && p.PriorityClass != ProcessPriorityClass.Idle)
                                {
                                    p.PriorityClass = ProcessPriorityClass.BelowNormal;
                                    Log(string.Format("[WATCHDOG] Process {0} (PID {1}) throttled to BelowNormal priority (RAM: {2}MB).", p.ProcessName, p.Id, ramMB), "WARN");
                                }
                                alerts.Add(new Dictionary<string, object>
                                {
                                    { "processName", p.ProcessName },
                                    { "pid", p.Id },
                                    { "ramMB", ramMB },
                                    { "status", "THROTTLED" },
                                    { "message", string.Format("Process using {0} MB RAM. Throttled to BelowNormal priority to safeguard VPS stability.", ramMB) }
                                });
                            }
                        }
                    }
                    catch { }
                }
                _activeProcessAlerts = alerts;
            }
            catch { }
        }

        public static void ConfigureShadowingPolicy(int shadowLevel = 2)
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services"))
                {
                    if (key != null)
                    {
                        // 2 = Full Control without user's permission (or 1 with consent)
                        key.SetValue("Shadow", shadowLevel, RegistryValueKind.DWord);
                    }
                }
                using (RegistryKey key2 = Registry.LocalMachine.CreateSubKey(@"SYSTEM\CurrentControlSet\Control\Terminal Server"))
                {
                    if (key2 != null)
                    {
                        key2.SetValue("fAllowToGetHelp", 1, RegistryValueKind.DWord);
                        key2.SetValue("fDenyTSConnections", 0, RegistryValueKind.DWord);
                    }
                }
                Log(string.Format("RDS Session Shadowing policy verified/set (Level {0} - Full Control).", shadowLevel), "POLICY");
                DeployDesktopRemoteAssistTool();
            }
            catch (Exception ex)
            {
                Log("Failed to configure RDS Shadowing policy: " + ex.Message, "WARN");
            }
        }

        private static void DeployDesktopRemoteAssistTool()
        {
            try
            {
                if (!Directory.Exists(_appDir)) Directory.CreateDirectory(_appDir);
                string scriptPath = Path.Combine(_appDir, "RemoteAssist.ps1");
                string psCode = @"Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Innovation VPS - 1-Click Remote Assist'
$form.Size = New-Object System.Drawing.Size(420, 390)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$form.ForeColor = [System.Drawing.Color]::White

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Active Client Sessions'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(20, 15)
$title.Size = New-Object System.Drawing.Size(360, 25)
$title.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248)
$form.Controls.Add($title)

$listBox = New-Object System.Windows.Forms.ListBox
$listBox.Location = New-Object System.Drawing.Point(20, 48)
$listBox.Size = New-Object System.Drawing.Size(360, 175)
$listBox.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$listBox.ForeColor = [System.Drawing.Color]::White
$listBox.Font = New-Object System.Drawing.Font('Consolas', 10)
$form.Controls.Add($listBox)

function Refresh-Sessions {
    $listBox.Items.Clear()
    $myId = (Get-Process -Id $PID).SessionId
    $lines = qwinsta
    foreach ($line in $lines[1..($lines.Count - 1)]) {
        $parts = $line.Trim() -split '\s+'
        if ($parts.Count -ge 3) {
            $sessName = $parts[0]
            if ($sessName -match '^\>') { $sessName = $sessName.Substring(1) }
            $uName = ''
            $sId = ''
            $st = ''
            if ($parts.Count -ge 4 -and $parts[2] -match '^\d+$') {
                $uName = $parts[1]
                $sId = $parts[2]
                $st = $parts[3]
            } elseif ($parts.Count -ge 3 -and $parts[1] -match '^\d+$') {
                $sId = $parts[1]
                $st = $parts[2]
            }
            if ($sId -and $sId -ne '0' -and $sId -ne ""$myId"" -and $st -eq 'Active') {
                $itemText = ""Session $sId : $uName ($st)""
                $listBox.Items.Add($itemText)
            }
        }
    }
    if ($listBox.Items.Count -eq 0) {
        $listBox.Items.Add('No other active client sessions.')
    } else {
        $listBox.SelectedIndex = 0
    }
}
Refresh-Sessions

$btnAssist = New-Object System.Windows.Forms.Button
$btnAssist.Text = '⚡ Full Control Assist'
$btnAssist.Location = New-Object System.Drawing.Point(20, 240)
$btnAssist.Size = New-Object System.Drawing.Size(175, 42)
$btnAssist.BackColor = [System.Drawing.Color]::FromArgb(2, 132, 199)
$btnAssist.ForeColor = [System.Drawing.Color]::White
$btnAssist.FlatStyle = 'Flat'
$btnAssist.Font = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
$btnAssist.Add_Click({
    if ($listBox.SelectedItem -match 'Session\s+(\d+)') {
        $targetId = $matches[1]
        Start-Process 'mstsc.exe' -ArgumentList ""/shadow:$targetId /control /noConsentPrompt""
    }
})
$form.Controls.Add($btnAssist)

$btnView = New-Object System.Windows.Forms.Button
$btnView.Text = '👁️ View Only'
$btnView.Location = New-Object System.Drawing.Point(205, 240)
$btnView.Size = New-Object System.Drawing.Size(175, 42)
$btnView.BackColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$btnView.ForeColor = [System.Drawing.Color]::White
$btnView.FlatStyle = 'Flat'
$btnView.Font = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
$btnView.Add_Click({
    if ($listBox.SelectedItem -match 'Session\s+(\d+)') {
        $targetId = $matches[1]
        Start-Process 'mstsc.exe' -ArgumentList ""/shadow:$targetId /noConsentPrompt""
    }
})
$form.Controls.Add($btnView)

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = '🔄 Refresh Sessions List'
$btnRefresh.Location = New-Object System.Drawing.Point(20, 295)
$btnRefresh.Size = New-Object System.Drawing.Size(360, 30)
$btnRefresh.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$btnRefresh.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$btnRefresh.FlatStyle = 'Flat'
$btnRefresh.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
$btnRefresh.Add_Click({ Refresh-Sessions })
$form.Controls.Add($btnRefresh)

[void]$form.ShowDialog()
";
                File.WriteAllText(scriptPath, psCode);

                string publicDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
                if (string.IsNullOrEmpty(publicDesktop) || !Directory.Exists(publicDesktop))
                {
                    publicDesktop = @"C:\Users\Public\Desktop";
                }

                if (Directory.Exists(publicDesktop))
                {
                    string batPath = Path.Combine(publicDesktop, "Remote Assist.bat");
                    string batContent = "@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + scriptPath + "\"\r\n";
                    File.WriteAllText(batPath, batContent);
                    Log("1-Click Remote Assist desktop shortcut deployed to " + batPath, "SETUP");
                }
            }
            catch (Exception ex)
            {
                Log("Failed to deploy desktop assist tool: " + ex.Message, "WARN");
            }
        }

        private static void CreateOrUpdateWindowsUser(string username, string pass, string company)
        {
            bool userCreated = false;
            try
            {
                using (var parent = new DirectoryEntry("WinNT://" + Environment.MachineName))
                {
                    DirectoryEntry userEntry = null;
                    try { userEntry = parent.Children.Find(username, "User"); } catch { }

                    if (userEntry != null)
                    {
                        userEntry.Invoke("SetPassword", new object[] { pass });
                        userEntry.Properties["Description"].Value = "Tally Client - " + company;
                        userEntry.CommitChanges();
                    }
                    else
                    {
                        var newUser = parent.Children.Add(username, "User");
                        newUser.Invoke("SetPassword", new object[] { pass });
                        newUser.Properties["Description"].Value = "Tally Client - " + company;
                        newUser.Properties["FullName"].Value = company;
                        newUser.CommitChanges();
                    }
                    userCreated = true;
                }
            }
            catch { }

            if (!userCreated)
            {
                if (!IsSafeUsername(username)) { Log("CreateOrUpdateWindowsUser: unsafe username rejected.", "WARN"); return; }
                RunProcess("net.exe", BuildArgs("user", username, pass, "/add", "/comment:Tally Client - " + company, "/expires:never", "/y"));
                RunProcess("net.exe", BuildArgs("user", username, pass, "/y"));
            }

            if (!IsSafeUsername(username)) return;
            RunProcess("net.exe", BuildArgs("localgroup", "Remote Desktop Users", username, "/add"));
        }

        private static void GrantFolderFullControl(string folderPath, string username)
        {
            try
            {
                var dInfo = new DirectoryInfo(folderPath);
                var dSec = dInfo.GetAccessControl();
                var inheritFlags = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
                var propFlags = PropagationFlags.None;

                if (!dSec.AreAccessRulesProtected)
                {
                    dSec.SetAccessRuleProtection(true, false);
                    dSec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                    dSec.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                }

                try
                {
                    dSec.AddAccessRule(new FileSystemAccessRule("superclient", FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                }
                catch { }

                try
                {
                    dSec.AddAccessRule(new FileSystemAccessRule(username, FileSystemRights.FullControl, inheritFlags, propFlags, AccessControlType.Allow));
                }
                catch { }

                dInfo.SetAccessControl(dSec);

                try
                {
                    RunProcess("icacls.exe", BuildArgs(folderPath, "/grant", "superclient:(OI)(CI)F", "/q"));
                }
                catch { }
            }
            catch (Exception ex)
            {
                Log("GrantFolderFullControl notice: " + ex.Message, "WARN");
            }
        }

        private static string CleanDirectoryName(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return "ClientData";
            string s = raw.Trim().Replace(" ", "_");
            char[] invalid = Path.GetInvalidFileNameChars();
            for (int i = 0; i < invalid.Length; i++) s = s.Replace(invalid[i].ToString(), "");
            return string.IsNullOrEmpty(s) ? "ClientData" : s;
        }

        #endregion

        #region Hardware & OS Metric Helpers

        private static Dictionary<string, object> GetHardwareSpecs()
        {
            var res = new Dictionary<string, object>();
            try
            {
                string cpuName = "";
                try
                {
                    using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0"))
                    {
                        if (key != null)
                        {
                            cpuName = Convert.ToString(key.GetValue("ProcessorNameString"));
                        }
                    }
                }
                catch { }

                if (string.IsNullOrEmpty(cpuName))
                {
                    try
                    {
                        using (var searcher = new System.Management.ManagementObjectSearcher("SELECT Name FROM Win32_Processor"))
                        {
                            foreach (var obj in searcher.Get())
                            {
                                cpuName = Convert.ToString(obj["Name"]);
                                break;
                            }
                        }
                    }
                    catch { }
                }

                if (string.IsNullOrEmpty(cpuName)) cpuName = "Multi-Core Processor";
                cpuName = System.Text.RegularExpressions.Regex.Replace(cpuName.Trim(), @"\s+", " ");

                int logicalCores = Environment.ProcessorCount;
                int physicalCores = logicalCores;

                try
                {
                    using (var searcher = new System.Management.ManagementObjectSearcher("SELECT NumberOfCores FROM Win32_Processor"))
                    {
                        int cSum = 0;
                        foreach (var obj in searcher.Get())
                        {
                            cSum += Convert.ToInt32(obj["NumberOfCores"]);
                        }
                        if (cSum > 0) physicalCores = cSum;
                    }
                }
                catch { }

                var ramStats = GetRamStats();
                double ramTotal = ramStats.ContainsKey("totalGB") ? Convert.ToDouble(ramStats["totalGB"]) : 0.0;
                int ramGB = (int)Math.Round(ramTotal, 0);

                var diskStats = GetDiskStats();
                double totalDisk = 0;
                foreach (var d in diskStats)
                {
                    if (d.ContainsKey("totalGB")) totalDisk += Convert.ToDouble(d["totalGB"]);
                }
                int diskGB = (int)Math.Round(totalDisk, 0);

                // Clean CPU name (strip (R), (TM), and @ speed)
                string cleanCpu = cpuName.Replace("(R)", "").Replace("(TM)", "").Trim();
                cleanCpu = System.Text.RegularExpressions.Regex.Replace(cleanCpu, @" CPU.*$", "");
                cleanCpu = System.Text.RegularExpressions.Regex.Replace(cleanCpu, @"\s+", " ").Trim();

                string specsStr = string.Format("{0} Core", physicalCores);
                if (logicalCores != physicalCores)
                {
                    specsStr += string.Format(" ({0} vCPU)", logicalCores);
                }
                if (ramGB > 0)
                {
                    specsStr += string.Format(" / {0}GB RAM", ramGB);
                }
                if (diskGB > 0)
                {
                    specsStr += string.Format(" / {0}GB Disk", diskGB);
                }
                if (!string.IsNullOrEmpty(cleanCpu))
                {
                    specsStr += string.Format(" • {0}", cleanCpu);
                }

                res["cpuName"] = cleanCpu;
                res["cpuFullName"] = cpuName;
                res["cpuCores"] = physicalCores;
                res["cpuLogical"] = logicalCores;
                res["ramTotalGB"] = ramGB;
                res["diskTotalGB"] = diskGB;
                res["specs"] = specsStr;
                return res;
            }
            catch { return null; }
        }

        private static double GetCpuUsage()
        {
            try
            {
                using (var searcher = new System.Management.ManagementObjectSearcher("SELECT LoadPercentage FROM Win32_Processor"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        return Convert.ToDouble(obj["LoadPercentage"]);
                    }
                }
            }
            catch { }
            return 0.0;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private class MEMORYSTATUSEX
        {
            public uint dwLength;
            public uint dwMemoryLoad;
            public ulong ullTotalPhys;
            public ulong ullAvailPhys;
            public ulong ullTotalPageFile;
            public ulong ullAvailPageFile;
            public ulong ullTotalVirtual;
            public ulong ullAvailVirtual;
            public ulong ullAvailExtendedVirtual;
            public MEMORYSTATUSEX() { this.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX)); }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX lpBuffer);

        private static Dictionary<string, object> GetRamStats()
        {
            var res = new Dictionary<string, object>();
            try
            {
                var mem = new MEMORYSTATUSEX();
                if (GlobalMemoryStatusEx(mem))
                {
                    double totalGb = Math.Round((double)mem.ullTotalPhys / (1024 * 1024 * 1024), 2);
                    double freeGb = Math.Round((double)mem.ullAvailPhys / (1024 * 1024 * 1024), 2);
                    double usedGb = Math.Round(totalGb - freeGb, 2);
                    int percent = (int)mem.dwMemoryLoad;

                    res["totalGB"] = totalGb;
                    res["freeGB"] = freeGb;
                    res["usedGB"] = usedGb;
                    res["usedPercent"] = percent;
                    return res;
                }
            }
            catch { }

            res["totalGB"] = 8.0;
            res["usedGB"] = 2.0;
            res["freeGB"] = 6.0;
            res["usedPercent"] = 25;
            return res;
        }

        private static List<Dictionary<string, object>> GetDiskStats()
        {
            var list = new List<Dictionary<string, object>>();
            try
            {
                foreach (var d in DriveInfo.GetDrives())
                {
                    if (d.IsReady && d.DriveType == DriveType.Fixed)
                    {
                        double totalGb = Math.Round((double)d.TotalSize / (1024 * 1024 * 1024), 2);
                        double freeGb = Math.Round((double)d.TotalFreeSpace / (1024 * 1024 * 1024), 2);
                        double usedGb = Math.Round(totalGb - freeGb, 2);
                        double pct = totalGb > 0 ? Math.Round((usedGb / totalGb) * 100, 1) : 0;

                        var dMap = new Dictionary<string, object>
                        {
                            { "drive", d.Name.TrimEnd('\\') },
                            { "totalGB", totalGb },
                            { "freeGB", freeGb },
                            { "usedGB", usedGb },
                            { "usedPercent", pct }
                        };
                        list.Add(dMap);
                    }
                }
            }
            catch { }
            return list;
        }

        private static List<Dictionary<string, object>> GetInstalledTallyVersions()
        {
            var versions = new List<Dictionary<string, object>>();
            var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            try
            {
                // Auto-create master TallyVersions directory with README if missing
                string masterRepo = @"C:\TallyVersions";
                if (!Directory.Exists(masterRepo))
                {
                    try
                    {
                        Directory.CreateDirectory(masterRepo);
                        string readme = "===========================================================\r\n" +
                                        "Tally Versions Repository for VPS Management System\r\n" +
                                        "===========================================================\r\n" +
                                        "Place standalone Tally version folders in this directory:\r\n" +
                                        "Example:\r\n" +
                                        "  C:\\TallyVersions\\TallyPrime 4.1\r\n" +
                                        "  C:\\TallyVersions\\TallyPrime 3.0\r\n" +
                                        "  C:\\TallyVersions\\Tally ERP 9\r\n" +
                                        "  C:\\TallyVersions\\Busy 21\r\n\r\n" +
                                        "Each folder should contain tally.exe or busy.exe.\r\n" +
                                        "The VPS Management Portal will automatically detect each version\r\n" +
                                        "and allow you to pick it when provisioning new clients!\r\n" +
                                        "===========================================================\r\n";
                        File.WriteAllText(Path.Combine(masterRepo, "README.txt"), readme);
                    }
                    catch { }
                }

                // 1. Scan subdirectories of C:\TallyVersions
                if (Directory.Exists(masterRepo))
                {
                    foreach (var dir in Directory.GetDirectories(masterRepo))
                    {
                        string exe = Path.Combine(dir, "tally.exe");
                        if (!File.Exists(exe)) exe = Path.Combine(dir, "busy.exe");
                        if (File.Exists(exe) && !seenPaths.Contains(dir))
                        {
                            seenPaths.Add(dir);
                            string folderName = Path.GetFileName(dir);
                            string ver = GetTallyFileVersion(exe) ?? folderName;
                            versions.Add(new Dictionary<string, object>
                            {
                                { "name", folderName },
                                { "version", ver },
                                { "path", dir },
                                { "exePath", exe },
                                { "isDefault", versions.Count == 0 }
                            });
                        }
                    }
                }

                // 2. Scan standard installation paths
                string[] standardPaths = new string[]
                {
                    @"C:\Program Files\TallyPrime",
                    @"C:\Program Files (x86)\TallyPrime",
                    @"C:\TallyPrime",
                    @"C:\TallyBase\TallyPrime",
                    @"C:\TallyBase",
                    @"C:\TallyMaster",
                    @"C:\Program Files\Tally.ERP9",
                    @"C:\Program Files (x86)\Tally.ERP9",
                    @"C:\Tally.ERP9"
                };

                foreach (var path in standardPaths)
                {
                    if (Directory.Exists(path) && File.Exists(Path.Combine(path, "tally.exe")) && !seenPaths.Contains(path))
                    {
                        seenPaths.Add(path);
                        string name = Path.GetFileName(path);
                        if (name.StartsWith("Program Files", StringComparison.OrdinalIgnoreCase)) name = "TallyPrime";
                        string ver = GetTallyFileVersion(Path.Combine(path, "tally.exe")) ?? name;
                        versions.Add(new Dictionary<string, object>
                        {
                            { "name", name },
                            { "version", ver },
                            { "path", path },
                            { "exePath", Path.Combine(path, "tally.exe") },
                            { "isDefault", versions.Count == 0 }
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Log("GetInstalledTallyVersions notice: " + ex.Message, "WARN");
            }

            return versions;
        }

        private static string GetTallyFileVersion(string exePath)
        {
            try
            {
                var fvi = System.Diagnostics.FileVersionInfo.GetVersionInfo(exePath);
                if (!string.IsNullOrEmpty(fvi.ProductVersion)) return fvi.ProductVersion.Trim();
                if (!string.IsNullOrEmpty(fvi.FileVersion)) return fvi.FileVersion.Trim();
            }
            catch { }
            return null;
        }

        private static List<string> GetOccupiedDrives()
        {
            var letters = new List<string>();
            try
            {
                foreach (var d in DriveInfo.GetDrives())
                {
                    string name = d.Name.TrimEnd('\\').ToUpper();
                    if (!string.IsNullOrEmpty(name))
                    {
                        letters.Add(name);
                    }
                }
            }
            catch { }
            return letters;
        }

        private static List<Dictionary<string, object>> GetPhysicalDiskStats()
        {
            var list = new List<Dictionary<string, object>>();
            try
            {
                using (var searcher = new System.Management.ManagementObjectSearcher(@"ROOT\Microsoft\Windows\Storage", "SELECT * FROM MSFT_Disk"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        try
                        {
                            long totalBytes = 0;
                            try { totalBytes = Convert.ToInt64(obj["Size"]); } catch { }
                            long allocatedBytes = 0;
                            try { allocatedBytes = Convert.ToInt64(obj["AllocatedSize"]); } catch { }
                            long unallocatedBytes = Math.Max(0, totalBytes - allocatedBytes);

                            double totalGb = Math.Round((double)totalBytes / (1024 * 1024 * 1024), 2);
                            double allocatedGb = Math.Round((double)allocatedBytes / (1024 * 1024 * 1024), 2);
                            double unallocatedGb = Math.Round((double)unallocatedBytes / (1024 * 1024 * 1024), 2);

                            bool isOffline = false;
                            try { isOffline = Convert.ToBoolean(obj["IsOffline"]); } catch { }
                            bool isReadOnly = false;
                            try { isReadOnly = Convert.ToBoolean(obj["IsReadOnly"]); } catch { }
                            int diskNumber = 0;
                            try { diskNumber = Convert.ToInt32(obj["Number"]); } catch { }
                            string friendlyName = "Disk " + diskNumber;
                            try { friendlyName = Convert.ToString(obj["FriendlyName"]); } catch { }
                            int partStyleCode = 0;
                            try { partStyleCode = Convert.ToInt32(obj["PartitionStyle"]); } catch { }
                            string partStyle = partStyleCode == 1 ? "MBR" : (partStyleCode == 2 ? "GPT" : "RAW");

                            string statusStr = isOffline ? "Offline" : (partStyle == "RAW" ? "Uninitialized" : "Online");

                            var d = new Dictionary<string, object>
                            {
                                { "diskNumber", diskNumber },
                                { "friendlyName", friendlyName },
                                { "totalGB", totalGb },
                                { "allocatedGB", allocatedGb },
                                { "unallocatedGB", unallocatedGb },
                                { "isOffline", isOffline },
                                { "isReadOnly", isReadOnly },
                                { "partitionStyle", partStyle },
                                { "operationalStatus", statusStr }
                            };
                            list.Add(d);
                        }
                        catch { }
                    }
                }
            }
            catch { }

            if (list.Count == 0)
            {
                try
                {
                    using (var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_DiskDrive"))
                    {
                        foreach (var obj in searcher.Get())
                        {
                            try
                            {
                                long size = Convert.ToInt64(obj["Size"]);
                                double totalGb = Math.Round((double)size / (1024 * 1024 * 1024), 2);
                                int index = Convert.ToInt32(obj["Index"]);
                                string model = Convert.ToString(obj["Model"]);

                                var d = new Dictionary<string, object>
                                {
                                    { "diskNumber", index },
                                    { "friendlyName", model },
                                    { "totalGB", totalGb },
                                    { "allocatedGB", totalGb },
                                    { "unallocatedGB", 0 },
                                    { "isOffline", false },
                                    { "isReadOnly", false },
                                    { "partitionStyle", "GPT" },
                                    { "operationalStatus", "Online" }
                                };
                                list.Add(d);
                            }
                            catch { }
                        }
                    }
                }
                catch { }
            }
            return list;
        }

        #endregion

        #region Live Screen Capture APIs (Zero-Trust Interactive Session Snapshot)

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(int sessionId, out IntPtr phToken);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXSizeText;
            public int dwYSizeText;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hDesktop;
            public IntPtr hStdout;
            public IntPtr hStderr;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        private static string CaptureSessionScreenAsBase64(int sessionId)
        {
            IntPtr hToken = IntPtr.Zero;
            try
            {
                if (!WTSQueryUserToken(sessionId, out hToken))
                {
                    int err = Marshal.GetLastWin32Error();
                    throw new Exception("WTSQueryUserToken failed for session " + sessionId + " (Error code: " + err + "). Session may be disconnected, locked, or idle.");
                }

                string tempDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "InnovationVpsAgent");
                if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                string screenFile = Path.Combine(tempDir, string.Format("screen_{0}.jpg", sessionId));
                if (File.Exists(screenFile))
                {
                    try { File.Delete(screenFile); } catch { }
                }

                string psScript = string.Format(
                    "[Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; " +
                    "[Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; " +
                    "$w = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; " +
                    "$h = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height; " +
                    "$bmp = New-Object System.Drawing.Bitmap($w, $h); " +
                    "$g = [System.Drawing.Graphics]::FromImage($bmp); " +
                    "$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size); " +
                    "$bmp.Save('{0}', [System.Drawing.Imaging.ImageFormat]::Jpeg); " +
                    "$g.Dispose(); $bmp.Dispose();",
                    screenFile.Replace("\\", "\\\\")
                );

                string encodedCommand = Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(psScript));
                string cmdLine = string.Format("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {0}", encodedCommand);

                STARTUPINFO si = new STARTUPINFO();
                si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
                si.lpDesktop = "winsta0\\default";

                PROCESS_INFORMATION pi = new PROCESS_INFORMATION();

                bool procCreated = CreateProcessAsUser(
                    hToken,
                    null,
                    cmdLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    0x08000000, // CREATE_NO_WINDOW
                    IntPtr.Zero,
                    tempDir,
                    ref si,
                    out pi
                );

                if (!procCreated)
                {
                    int err = Marshal.GetLastWin32Error();
                    throw new Exception("CreateProcessAsUser failed with error: " + err);
                }

                try
                {
                    WaitForSingleObject(pi.hProcess, 6000);
                }
                finally
                {
                    if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
                    if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
                }

                if (File.Exists(screenFile))
                {
                    byte[] bytes = File.ReadAllBytes(screenFile);
                    return Convert.ToBase64String(bytes);
                }

                throw new Exception("Screen capture output file was not generated.");
            }
            finally
            {
                if (hToken != IntPtr.Zero) CloseHandle(hToken);
            }
        }

        #endregion

        #region Session Management & Terminal Services APIs

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSLogoffSession(IntPtr hServer, int SessionId, bool bWait);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern IntPtr WTSOpenServer([MarshalAs(UnmanagedType.LPStr)] string pServerName);

        [DllImport("wtsapi32.dll")]
        private static extern void WTSCloseServer(IntPtr hServer);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern int WTSEnumerateSessions(IntPtr hServer, int Reserved, int Version, ref IntPtr ppSessionInfo, ref int pCount);

        [DllImport("wtsapi32.dll")]
        private static extern void WTSFreeMemory(IntPtr pMemory);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQuerySessionInformation(IntPtr hServer, int sessionId, WTS_INFO_CLASS wtsInfoClass, out IntPtr ppBuffer, out uint pBytesReturned);

        private enum WTS_INFO_CLASS
        {
            WTSInitialProgram,
            WTSApplicationName,
            WTSWorkingDirectory,
            WTSOEMId,
            WTSSessionId,
            WTSUserName,
            WTSWinStationName,
            WTSDomainName,
            WTSConnectState,
            WTSClientBuildNumber,
            WTSClientName,
            WTSClientDirectory,
            WTSClientProductId,
            WTSClientHardwareId,
            WTSClientAddress,
            WTSClientDisplay,
            WTSClientProtocolType
        }

        private enum WTS_CONNECTSTATE_CLASS
        {
            WTSActive,
            WTSConnected,
            WTSConnectQuery,
            WTSShadow,
            WTSDisconnected,
            WTSIdle,
            WTSListen,
            WTSReset,
            WTSDown,
            WTSInit
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WTS_SESSION_INFO
        {
            public int SessionID;
            [MarshalAs(UnmanagedType.LPStr)]
            public string pWinStationName;
            public WTS_CONNECTSTATE_CLASS State;
        }

        private static Dictionary<string, object> GetUserSessions()
        {
            var res = new Dictionary<string, object>();
            var activeUsers = new List<string>();
            var disconnectedUsers = new List<string>();
            var detailed = new List<Dictionary<string, object>>();

            IntPtr pSessionInfo = IntPtr.Zero;
            int count = 0;

            try
            {
                if (WTSEnumerateSessions(IntPtr.Zero, 0, 1, ref pSessionInfo, ref count) != 0)
                {
                    int structSize = Marshal.SizeOf(typeof(WTS_SESSION_INFO));
                    IntPtr current = pSessionInfo;

                    for (int i = 0; i < count; i++)
                    {
                        var si = (WTS_SESSION_INFO)Marshal.PtrToStructure(current, typeof(WTS_SESSION_INFO));
                        current = (IntPtr)((long)current + structSize);

                        // Query username
                        string username = QuerySessionInfoStr(si.SessionID, WTS_INFO_CLASS.WTSUserName);
                        if (string.IsNullOrEmpty(username)) continue;

                        // Query client name
                        string clientName = QuerySessionInfoStr(si.SessionID, WTS_INFO_CLASS.WTSClientName);

                        string stateStr = (si.State == WTS_CONNECTSTATE_CLASS.WTSActive) ? "Active" :
                                         ((si.State == WTS_CONNECTSTATE_CLASS.WTSDisconnected) ? "Disconnected" : si.State.ToString());

                        if (si.State == WTS_CONNECTSTATE_CLASS.WTSActive)
                        {
                            if (!activeUsers.Contains(username)) activeUsers.Add(username);
                        }
                        else if (si.State == WTS_CONNECTSTATE_CLASS.WTSDisconnected)
                        {
                            if (!disconnectedUsers.Contains(username)) disconnectedUsers.Add(username);
                        }

                        var sessItem = new Dictionary<string, object>
                        {
                            { "sessionId", si.SessionID },
                            { "username", username },
                            { "state", stateStr },
                            { "clientName", clientName ?? "" },
                            { "logonTime", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                        };
                        detailed.Add(sessItem);
                    }
                }
            }
            catch (Exception ex)
            {
                Log("WTS session enumeration notice: " + ex.Message, "WARN");
            }
            finally
            {
                if (pSessionInfo != IntPtr.Zero) WTSFreeMemory(pSessionInfo);
            }

            // Fallback to quser if WTS returned 0
            if (detailed.Count == 0)
            {
                ParseQuserSessions(activeUsers, disconnectedUsers, detailed);
            }

            res["activeUsers"] = activeUsers;
            res["activeCount"] = activeUsers.Count;
            res["disconnectedUsers"] = disconnectedUsers;
            res["disconnectedCount"] = disconnectedUsers.Count;
            res["detailedSessions"] = detailed;
            return res;
        }

        private static string QuerySessionInfoStr(int sessionId, WTS_INFO_CLASS infoClass)
        {
            IntPtr buffer = IntPtr.Zero;
            uint bytesReturned = 0;
            try
            {
                if (WTSQuerySessionInformation(IntPtr.Zero, sessionId, infoClass, out buffer, out bytesReturned) && buffer != IntPtr.Zero)
                {
                    return Marshal.PtrToStringAnsi(buffer);
                }
            }
            catch { }
            finally
            {
                if (buffer != IntPtr.Zero) WTSFreeMemory(buffer);
            }
            return "";
        }

        private static void HandleDuplicateSessionsForNewLogon(int newSessionId)
        {
            try
            {
                // Wait briefly for Windows session manager to register username
                Thread.Sleep(1200);

                string username = QuerySessionInfoStr(newSessionId, WTS_INFO_CLASS.WTSUserName);
                if (string.IsNullOrEmpty(username)) return;

                string cleanUser = CleanUsername(username);
                if (string.IsNullOrEmpty(cleanUser)) return;

                // Exclusion Whitelist
                string[] excludedUsers = new string[] { "administrator", "superclient", "guest", "defaultaccount", "wdagutilityaccount", "system" };
                foreach (string ex in excludedUsers)
                {
                    if (cleanUser.Equals(ex, StringComparison.OrdinalIgnoreCase)) return;
                }

                Log(string.Format("[SESSION_TRACKER] New logon verified: User='{0}' in Session {1}", cleanUser, newSessionId), "INFO");

                var sessionsData = GetUserSessions();
                if (!sessionsData.ContainsKey("detailedSessions")) return;

                var detailedList = sessionsData["detailedSessions"] as List<Dictionary<string, object>>;
                if (detailedList == null) return;

                var olderSessions = new List<int>();
                foreach (var s in detailedList)
                {
                    int sid = Convert.ToInt32(s["sessionId"]);
                    string sUser = CleanUsername(Convert.ToString(s["username"]));

                    if (sid != newSessionId && sUser.Equals(cleanUser, StringComparison.OrdinalIgnoreCase))
                    {
                        olderSessions.Add(sid);
                    }
                }

                if (olderSessions.Count == 0)
                {
                    Log(string.Format("[SESSION_TRACKER] User '{0}' has single active session ({1}). No duplicate.", cleanUser, newSessionId), "INFO");
                    return;
                }

                foreach (int oldId in olderSessions)
                {
                    Log(string.Format("[DUPLICATE_SESSION_DETECTED] User '{0}' duplicate found! Keeping New: Session {1} | Target Old: Session {2} | Policy Mode: {3}",
                        cleanUser, newSessionId, oldId, _duplicateSessionMode), "AUDIT");

                    if (_duplicateSessionMode.Equals("Audit", StringComparison.OrdinalIgnoreCase))
                    {
                        Log(string.Format("[AUDIT RECORD] Session {0} for user '{1}' was NOT terminated (Mode: AUDIT). In Enforce mode, it would be safely logged off.", oldId, cleanUser), "AUDIT");
                        SendSessionEvent(oldId, string.Format("DUPLICATE_SESSION_AUDIT: New Session {0} logged on", newSessionId));
                    }
                    else if (_duplicateSessionMode.Equals("Enforce", StringComparison.OrdinalIgnoreCase))
                    {
                        Log(string.Format("[ENFORCE] Initiating safe graceful logoff for Session {0} with {1}s warning...", oldId, _duplicateGracePeriodSeconds), "ACTION");

                        // 1. In-session warning notification via msg.exe
                        try
                        {
                            string warningText = string.Format("A new login was detected for account '{0}'. This previous session will close in {1} seconds to keep your account secure.", cleanUser, _duplicateGracePeriodSeconds);
                            RunProcess("msg.exe", BuildArgs(oldId.ToString(), "/time:" + _duplicateGracePeriodSeconds.ToString(), warningText));
                        }
                        catch { }

                        // 2. Wait grace period so user can save or cancel
                        if (_duplicateGracePeriodSeconds > 0)
                        {
                            Thread.Sleep(_duplicateGracePeriodSeconds * 1000);
                        }

                        // 3. Forceful Windows session logoff using multiple robust mechanisms
                        try
                        {
                            RunProcess("logoff.exe", oldId.ToString());
                            RunProcess("rwinsta.exe", oldId.ToString());
                            WTSLogoffSession(IntPtr.Zero, oldId, false);
                            Log(string.Format("[SUCCESS] Successfully logged off older duplicate Session {0} for user '{1}'.", oldId, cleanUser), "SUCCESS");
                            
                            string reasonDesc = string.Format("User '{0}' ne multiple login kiya. Purani Session {1} ko auto-logout kar diya gaya (Naya Session {2} active hai).", cleanUser, oldId, newSessionId);
                            SendDuplicateSessionEvent(cleanUser, newSessionId, oldId, "AUTO_LOGGED_OFF", reasonDesc);
                        }
                        catch (Exception exLogoff)
                        {
                            Log(string.Format("Notice logging off Session {0}: {1}", oldId, exLogoff.Message), "WARN");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Error in HandleDuplicateSessionsForNewLogon: " + ex.Message, "WARN");
            }
        }

        private static void ScanAndEnforceSingleActiveSession()
        {
            try
            {
                if (!_duplicateSessionMode.Equals("Enforce", StringComparison.OrdinalIgnoreCase)) return;

                var sessionsData = GetUserSessions();
                if (!sessionsData.ContainsKey("detailedSessions")) return;

                var detailedList = sessionsData["detailedSessions"] as List<Dictionary<string, object>>;
                if (detailedList == null || detailedList.Count <= 1) return;

                // Group sessions by username
                var userGroups = new Dictionary<string, List<Dictionary<string, object>>>(StringComparer.OrdinalIgnoreCase);
                foreach (var s in detailedList)
                {
                    string u = CleanUsername(Convert.ToString(s["username"]));
                    if (string.IsNullOrEmpty(u)) continue;

                    // Whitelist exclusions
                    if (u.Equals("administrator", StringComparison.OrdinalIgnoreCase) ||
                        u.Equals("superclient", StringComparison.OrdinalIgnoreCase) ||
                        u.Equals("guest", StringComparison.OrdinalIgnoreCase) ||
                        u.Equals("defaultaccount", StringComparison.OrdinalIgnoreCase) ||
                        u.Equals("wdagutilityaccount", StringComparison.OrdinalIgnoreCase) ||
                        u.Equals("system", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (!userGroups.ContainsKey(u)) userGroups[u] = new List<Dictionary<string, object>>();
                    userGroups[u].Add(s);
                }

                foreach (var kvp in userGroups)
                {
                    string u = kvp.Key;
                    var sessList = kvp.Value;
                    if (sessList.Count <= 1) continue;

                    // User has multiple sessions! Find newest session (highest session ID)
                    int maxSessionId = -1;
                    foreach (var s in sessList)
                    {
                        int sid = Convert.ToInt32(s["sessionId"]);
                        if (sid > maxSessionId) maxSessionId = sid;
                    }

                    // Terminate all sessions other than maxSessionId
                    foreach (var s in sessList)
                    {
                        int sid = Convert.ToInt32(s["sessionId"]);
                        if (sid != maxSessionId)
                        {
                            Log(string.Format("[WATCHDOG_ENFORCE] Duplicate session detected for user '{0}'! Keeping newest Session {1}, immediately terminating older Session {2}...", u, maxSessionId, sid), "ACTION");

                            try
                            {
                                try { Process.Start(new ProcessStartInfo("logoff.exe", sid.ToString()) { CreateNoWindow = true, UseShellExecute = false }); } catch { }
                                try { Process.Start(new ProcessStartInfo("rwinsta.exe", sid.ToString()) { CreateNoWindow = true, UseShellExecute = false }); } catch { }
                                WTSLogoffSession(IntPtr.Zero, sid, false);
                                Log(string.Format("[SUCCESS] Terminated older duplicate Session {0} for user '{1}'.", sid, u), "SUCCESS");
                                
                                string reasonDesc = string.Format("User '{0}' ne multiple login kiya. Purani Session {1} ko auto-logout kar diya gaya (Naya Session {2} active hai).", u, sid, maxSessionId);
                                SendDuplicateSessionEvent(u, maxSessionId, sid, "AUTO_LOGGED_OFF", reasonDesc);
                            }
                            catch (Exception exLog)
                            {
                                Log("Notice terminating session " + sid + ": " + exLog.Message, "WARN");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Error in ScanAndEnforceSingleActiveSession: " + ex.Message, "WARN");
            }
        }

        private static void SendDuplicateSessionEvent(string username, int newSessionId, int oldSessionId, string action, string reason)
        {
            try
            {
                ConfigureSecurityProtocols();
                string eventUrl = _portalBase.TrimEnd('/') + "/api/agent/duplicate-session-event";

                var payload = new Dictionary<string, object>
                {
                    { "serverId", _serverId },
                    { "serverToken", _serverToken },
                    { "username", username },
                    { "newSessionId", newSessionId },
                    { "oldSessionId", oldSessionId },
                    { "action", action },
                    { "reason", reason },
                    { "timestamp", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                };

                var serializer = new JavaScriptSerializer();
                string json = serializer.Serialize(payload);

                using (var wc = new TimeoutWebClient(8000))
                {
                    wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                    wc.UploadString(eventUrl, "POST", json);
                }
                Log(string.Format("Reported duplicate session auto-logout to portal for '{0}' (Old: {1}, New: {2})", username, oldSessionId, newSessionId), "SUCCESS");
            }
            catch (Exception ex)
            {
                Log("Warning sending duplicate session event: " + ex.Message, "WARN");
            }
        }

        private static void ParseQuserSessions(List<string> active, List<string> disc, List<Dictionary<string, object>> detailed)
        {
            try
            {
                string output = RunProcessWithOutput("quser.exe", "");
                if (string.IsNullOrEmpty(output)) output = RunProcessWithOutput("query.exe", "user");
                if (string.IsNullOrEmpty(output)) return;

                string[] lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string line in lines)
                {
                    if (line.Contains("USERNAME") && line.Contains("SESSIONNAME")) continue;
                    string clean = line.Replace(">", "").Trim();
                    string[] tokens = clean.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (tokens.Length >= 3)
                    {
                        string user = tokens[0];
                        string state = "Active";
                        int sId = 0;

                        if (tokens[1].Equals("Disc", StringComparison.OrdinalIgnoreCase))
                        {
                            state = "Disconnected";
                            int.TryParse(tokens[2], out sId);
                        }
                        else
                        {
                            int.TryParse(tokens[2], out sId);
                            if (tokens.Length >= 4 && tokens[3].Equals("Disc", StringComparison.OrdinalIgnoreCase)) state = "Disconnected";
                        }

                        if (state == "Active" && !active.Contains(user)) active.Add(user);
                        if (state == "Disconnected" && !disc.Contains(user)) disc.Add(user);

                        detailed.Add(new Dictionary<string, object>
                        {
                            { "sessionId", sId },
                            { "username", user },
                            { "state", state },
                            { "logonTime", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") }
                        });
                    }
                }
            }
            catch { }
        }

        private static int FindSessionIdForUser(string user)
        {
            var sessions = GetUserSessions();
            var list = sessions["detailedSessions"] as List<Dictionary<string, object>>;
            if (list != null)
            {
                foreach (var s in list)
                {
                    if (Convert.ToString(s["username"]).Equals(user, StringComparison.OrdinalIgnoreCase))
                    {
                        return Convert.ToInt32(s["sessionId"]);
                    }
                }
            }
            return 0;
        }

        private static void KillUserProcesses(string username)
        {
            try
            {
                using (var searcher = new System.Management.ManagementObjectSearcher("SELECT ProcessId FROM Win32_Process"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        try
                        {
                            var proc = (System.Management.ManagementObject)obj;
                            object[] outParams = new object[2];
                            proc.InvokeMethod("GetOwner", outParams);
                            string owner = outParams[0] != null ? outParams[0].ToString() : "";
                            if (owner.Equals(username, StringComparison.OrdinalIgnoreCase))
                            {
                                int pid = Convert.ToInt32(proc["ProcessId"]);
                                try { Process.GetProcessById(pid).Kill(); } catch { }
                            }
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }

        #endregion

        #region User Account Reporting Helpers

        private static Dictionary<string, object> GetServerLocalUsers()
        {
            var all = new List<string>();
            var disabled = new List<string>();
            var result = new Dictionary<string, object> { { "all", all }, { "disabled", disabled } };

            try
            {
                using (var localMachine = new DirectoryEntry("WinNT://" + Environment.MachineName))
                {
                    foreach (DirectoryEntry child in localMachine.Children)
                    {
                        if (child.SchemaClassName == "User")
                        {
                            string name = child.Name;
                            if (IsIgnoredSystemUser(name)) continue;

                            all.Add(name);

                            try
                            {
                                int userFlags = (int)child.Properties["UserFlags"].Value;
                                if ((userFlags & 2) != 0) // ADS_UF_ACCOUNTDISABLE = 2
                                {
                                    disabled.Add(name);
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch
            {
                // Fallback to net.exe user
                try
                {
                    string output = RunProcessWithOutput("net.exe", "user");
                    string[] lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    bool inUsers = false;
                    foreach (var line in lines)
                    {
                        if (line.StartsWith("---")) { inUsers = true; continue; }
                        if (line.Contains("The command completed")) break;
                        if (inUsers)
                        {
                            string[] tokens = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                            foreach (var t in tokens)
                            {
                                string clean = t.Trim();
                                if (!string.IsNullOrEmpty(clean) && !IsIgnoredSystemUser(clean))
                                {
                                    if (!all.Contains(clean)) all.Add(clean);
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            return result;
        }

        private static bool IsIgnoredSystemUser(string user)
        {
            string u = user.ToLowerInvariant();
            return u == "administrator" || u == "guest" || u == "defaultaccount" || u == "wdagutilityaccount" || u.StartsWith("defaultuser") || u == "krbtgt";
        }

        private static string CleanUsername(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return "";
            string clean = raw.Trim();
            if (clean.Contains("\\")) clean = clean.Substring(clean.LastIndexOf('\\') + 1);
            return clean.Trim();
        }

        #endregion

        #region Tally Provisioning Helper

        private static void CloneTallyTemplate(string destTallyDir, string customTemplatePath = null)
        {
            try
            {
                if (!string.IsNullOrEmpty(customTemplatePath) && Directory.Exists(customTemplatePath) && File.Exists(Path.Combine(customTemplatePath, "tally.exe")))
                {
                    Log("Cloning specific Tally template from: " + customTemplatePath + " -> " + destTallyDir, "PROVISION");
                    CopyDirectory(customTemplatePath, destTallyDir, 0);
                    Log("Specific Tally version template cloned successfully.", "PROVISION");
                    return;
                }

                string[] candidates = new string[]
                {
                    @"C:\TallyVersions\TallyPrime 4.1",
                    @"C:\TallyVersions\TallyPrime",
                    @"C:\TallyBase\TallyPrime",
                    @"C:\TallyBase",
                    @"C:\TallyMaster",
                    @"C:\Program Files\TallyPrime",
                    @"C:\Program Files (x86)\TallyPrime",
                    @"C:\TallyPrime",
                    @"C:\Program Files (x86)\Tally.ERP9",
                    @"C:\Tally.ERP9"
                };

                foreach (var cand in candidates)
                {
                    try
                    {
                        if (Directory.Exists(cand) && File.Exists(Path.Combine(cand, "tally.exe")))
                        {
                            Log("Cloning Tally template from: " + cand + " -> " + destTallyDir, "PROVISION");
                            CopyDirectory(cand, destTallyDir, 0);
                            Log("Tally template cloned successfully.", "PROVISION");
                            break;
                        }
                    }
                    catch (Exception ex)
                    {
                        Log("Notice while checking template candidate (" + cand + "): " + ex.Message, "WARN");
                    }
                }
            }
            catch (Exception ex)
            {
                Log("CloneTallyTemplate notice: " + ex.Message, "WARN");
            }
        }

        private static void CopyDirectory(string sourceDir, string destinationDir, int depth)
        {
            if (depth > 6) return; // Prevent excessive recursion depth

            try
            {
                Directory.CreateDirectory(destinationDir);
            }
            catch { return; }

            // Copy files safely with per-file exception handling
            try
            {
                string[] files = Directory.GetFiles(sourceDir);
                foreach (string file in files)
                {
                    try
                    {
                        string name = Path.GetFileName(file);
                        if (string.IsNullOrEmpty(name)) continue;
                        if (name.EndsWith(".lock", StringComparison.OrdinalIgnoreCase) || 
                            name.EndsWith(".dmp", StringComparison.OrdinalIgnoreCase) ||
                            name.EndsWith(".log", StringComparison.OrdinalIgnoreCase) ||
                            name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)) continue;

                        string destFile = Path.Combine(destinationDir, name);
                        File.Copy(file, destFile, true);
                    }
                    catch { /* Continue copying remaining files even if one is locked */ }
                }
            }
            catch { }

            // Copy subdirectories safely, strictly skipping reparse points (symlinks/junctions)
            try
            {
                var dirInfo = new DirectoryInfo(sourceDir);
                foreach (var dir in dirInfo.GetDirectories())
                {
                    try
                    {
                        if ((dir.Attributes & FileAttributes.ReparsePoint) == FileAttributes.ReparsePoint) continue;

                        string name = dir.Name;
                        if (name.Equals("Data", StringComparison.OrdinalIgnoreCase) || 
                            name.Equals("logs", StringComparison.OrdinalIgnoreCase) ||
                            name.Equals("temp", StringComparison.OrdinalIgnoreCase) ||
                            name.Equals("backup", StringComparison.OrdinalIgnoreCase)) continue;

                        string nextDest = Path.Combine(destinationDir, name);
                        if (nextDest.StartsWith(sourceDir, StringComparison.OrdinalIgnoreCase) && 
                            sourceDir.StartsWith(nextDest, StringComparison.OrdinalIgnoreCase)) continue;

                        CopyDirectory(dir.FullName, nextDest, depth + 1);
                    }
                    catch { }
                }
            }
            catch { }
        }

        public static void SetTallyIniPaths(string iniPath, string companyRoot, string dataDir = null, string exportDir = null)
        {
            try
            {
                if (string.IsNullOrEmpty(iniPath)) return;
                string parentDir = Path.GetDirectoryName(iniPath);
                if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir)) Directory.CreateDirectory(parentDir);

                if (string.IsNullOrEmpty(dataDir)) dataDir = Path.Combine(companyRoot, "Data");
                if (string.IsNullOrEmpty(exportDir)) exportDir = Path.Combine(companyRoot, "Export");
                string configDir = parentDir;
                string tdlDir = Path.Combine(companyRoot, "tdl");
                string langDir = Directory.Exists(Path.Combine(parentDir, "lang")) ? Path.Combine(parentDir, "lang") : Path.Combine(companyRoot, "lang");

                // Clear ReadOnly file attribute if set so file is editable
                try
                {
                    if (File.Exists(iniPath))
                    {
                        var fAttrs = File.GetAttributes(iniPath);
                        if ((fAttrs & FileAttributes.ReadOnly) == FileAttributes.ReadOnly)
                        {
                            File.SetAttributes(iniPath, fAttrs & ~FileAttributes.ReadOnly);
                        }
                    }
                }
                catch { }

                if (File.Exists(iniPath))
                {
                    string iniText = File.ReadAllText(iniPath, Encoding.Default);
                    bool hasData = System.Text.RegularExpressions.Regex.IsMatch(iniText, @"(?im)^\s*Data\s*=");
                    bool hasExport = System.Text.RegularExpressions.Regex.IsMatch(iniText, @"(?im)^\s*Export\s*=");

                    // If paths already exist in tally.ini, PRESERVE them! Do not overwrite user/admin customization.
                    if (hasData && hasExport)
                    {
                        Log(string.Format("tally.ini at {0} already contains configured paths. Preserving existing user paths.", iniPath), "INFO");
                        return;
                    }

                    // Ensure [TALLY] or [Tally] header exists
                    if (!System.Text.RegularExpressions.Regex.IsMatch(iniText, @"(?im)\[TALLY\]"))
                    {
                        iniText = "[TALLY]\r\n" + iniText;
                    }

                    // 1. Data= (only initialize if missing)
                    if (!hasData)
                    {
                        if (!Directory.Exists(dataDir)) Directory.CreateDirectory(dataDir);
                        iniText = System.Text.RegularExpressions.Regex.Replace(iniText, @"(?im)(\[TALLY\])", "$1\r\nData=" + dataDir);
                        Log(string.Format("Initialized missing Data path in existing tally.ini: {0}", dataDir), "INFO");
                    }

                    // 2. Export= (only initialize if missing)
                    if (!hasExport)
                    {
                        if (!Directory.Exists(exportDir)) Directory.CreateDirectory(exportDir);
                        if (System.Text.RegularExpressions.Regex.IsMatch(iniText, @"(?im)^\s*Data\s*=.*$"))
                        {
                            iniText = System.Text.RegularExpressions.Regex.Replace(iniText, @"(?im)(^\s*Data\s*=.*$)", "$1\r\nExport=" + exportDir + "\r\nExport Path=" + exportDir);
                        }
                        else
                        {
                            iniText = System.Text.RegularExpressions.Regex.Replace(iniText, @"(?im)(\[TALLY\])", "$1\r\nExport=" + exportDir + "\r\nExport Path=" + exportDir);
                        }
                    }

                    // 3. Config= (only initialize if missing)
                    if (!System.Text.RegularExpressions.Regex.IsMatch(iniText, @"(?im)^\s*Config\s*="))
                    {
                        iniText += "\r\nConfig=" + configDir;
                    }

                    // 4. LangPath= (only initialize if missing)
                    if (!System.Text.RegularExpressions.Regex.IsMatch(iniText, @"(?im)^\s*LangPath\s*="))
                    {
                        if (!Directory.Exists(langDir)) Directory.CreateDirectory(langDir);
                        iniText += "\r\nLangPath=" + langDir;
                    }

                    File.WriteAllText(iniPath, iniText, Encoding.Default);
                    Log(string.Format("Configured missing tally.ini paths at {0}", iniPath), "SUCCESS");
                }
                else
                {
                    // First-time creation: tally.ini does NOT exist
                    if (!Directory.Exists(dataDir)) Directory.CreateDirectory(dataDir);
                    if (!Directory.Exists(exportDir)) Directory.CreateDirectory(exportDir);
                    if (!Directory.Exists(tdlDir)) Directory.CreateDirectory(tdlDir);
                    if (!Directory.Exists(langDir)) Directory.CreateDirectory(langDir);

                    string template = string.Format(
                        ";; TallyPrime workstation specific parameters file\r\n" +
                        "[TALLY]\r\n\r\n" +
                        ";; Specify location of Data files\r\n" +
                        "Data={0}\r\n" +
                        "Export={1}\r\n" +
                        "Export Path={1}\r\n\r\n" +
                        ";; Specify location of TALLYSAV.tsf (saved configuration of Tally)\r\n" +
                        "Config={2}\r\n\r\n" +
                        ";; Specify location of Language Files\r\n" +
                        "LangPath={3}\r\n\r\n" +
                        "Default Companies = Yes\r\n" +
                        "Color = Yes\r\n" +
                        "Sound = Yes\r\n",
                        dataDir, exportDir, configDir, langDir);
                    File.WriteAllText(iniPath, template, Encoding.Default);
                    Log(string.Format("Created first-time template tally.ini at {0} (Data={1}, Export={2}, Config={3}, LangPath={4})", 
                        iniPath, dataDir, exportDir, configDir, langDir), "SUCCESS");
                }
            }
            catch (Exception ex)
            {
                Log("Notice updating tally.ini (" + iniPath + "): " + ex.Message, "WARN");
            }
        }

        public static void LockDownTallyIniPermissions(string iniPath, string username)
        {
            try
            {
                if (string.IsNullOrEmpty(iniPath) || !File.Exists(iniPath)) return;

                // Clear ReadOnly file attribute if set so user can freely edit
                try
                {
                    var fAttrs = File.GetAttributes(iniPath);
                    if ((fAttrs & FileAttributes.ReadOnly) == FileAttributes.ReadOnly)
                    {
                        File.SetAttributes(iniPath, fAttrs & ~FileAttributes.ReadOnly);
                    }
                }
                catch { }

                var fInfo = new FileInfo(iniPath);
                var fSec = fInfo.GetAccessControl();

                // Break inheritance without copying inherited rules
                fSec.SetAccessRuleProtection(true, false);

                // Administrators Full Control
                fSec.AddAccessRule(new FileSystemAccessRule(
                    new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
                    FileSystemRights.FullControl,
                    AccessControlType.Allow));

                // SYSTEM Full Control
                fSec.AddAccessRule(new FileSystemAccessRule(
                    new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                    FileSystemRights.FullControl,
                    AccessControlType.Allow));

                // superclient Full Control
                try
                {
                    fSec.AddAccessRule(new FileSystemAccessRule(
                        "superclient",
                        FileSystemRights.FullControl,
                        AccessControlType.Allow));
                }
                catch (Exception exS)
                {
                    Log("Notice applying superclient FullControl rule to tally.ini: " + exS.Message, "WARN");
                }

                // Client User Modify permission (allows user to change data path later without Access Denied)
                if (!string.IsNullOrEmpty(username))
                {
                    try
                    {
                        fSec.AddAccessRule(new FileSystemAccessRule(
                            username,
                            FileSystemRights.Modify,
                            AccessControlType.Allow));
                    }
                    catch (Exception exU)
                    {
                        Log("Notice applying user Modify rule: " + exU.Message, "WARN");
                    }
                }

                fInfo.SetAccessControl(fSec);

                // Defense-in-depth with native icacls
                try
                {
                    if (IsSafeUsername(username))
                        RunProcess("icacls.exe", BuildArgs(iniPath, "/grant", "superclient:(F)", username + ":(M)", "/q"));
                }
                catch { }

                Log(string.Format("Configured tally.ini permissions: {0} (Administrators/superclient=FullControl, User '{1}'=Modify)", iniPath, username), "SUCCESS");
            }
            catch (Exception ex)
            {
                // Fallback using icacls
                try
                {
                    if (IsSafeUsername(username))
                        RunProcess("icacls.exe", BuildArgs(iniPath, "/inheritance:r", "/grant:r", "Administrators:(F)", "SYSTEM:(F)", "superclient:(F)", username + ":(M)", "/Q"));
                }
                catch { }
                Log("Notice setting tally.ini permissions: " + ex.Message, "WARN");
            }
        }

        public static void SyncAllCompanyTallyInis()
        {
            // Deprecated: Paths are set ONLY once at user creation time.
            // Automatic drive scanning is disabled so no unwanted Data/Export folders are created in other directories,
            // and any subsequent path changes made by the user/admin in tally.ini remain untouched.
        }

        #endregion

        #region Drive-Level Zero-Trust NTFS Security Isolation

        private static void ApplyDriveLevelNtfsIsolation(string driveLetter, string username)
        {
            try
            {
                if (string.IsNullOrEmpty(driveLetter)) return;
                string cleanLetter = driveLetter.Trim().ToUpper();
                if (cleanLetter.StartsWith("DRIVE")) cleanLetter = cleanLetter.Substring(5).Trim();
                if (!cleanLetter.EndsWith(":")) cleanLetter += ":";

                // CRITICAL SAFETY GUARD: NEVER lock Windows system drive C:
                if (cleanLetter.StartsWith("C:"))
                {
                    Log("Drive-Level NTFS Isolation strictly bypassed for system drive C:.", "INFO");
                    return;
                }

                string driveRoot = cleanLetter + "\\";
                if (!IsSafeDriveRoot(driveRoot) || (!string.IsNullOrEmpty(username) && !IsSafeUsername(username)))
                {
                    Log("Drive-Level NTFS Isolation rejected: unsafe drive root or username.", "WARN");
                    return;
                }
                if (!Directory.Exists(driveRoot))
                {
                    Log("Drive root directory does not exist: " + driveRoot, "WARN");
                    return;
                }

                Log("Applying Drive-Level Zero-Trust NTFS Security Isolation on: " + driveRoot + " for user '" + username + "'", "SECURITY");

                var dInfo = new DirectoryInfo(driveRoot);
                var dSec = dInfo.GetAccessControl();
                var inheritFlags = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
                var propFlags = PropagationFlags.None;

                // 1. Break inheritance and protect current access rules
                dSec.SetAccessRuleProtection(true, false);

                // 2. Explicitly remove unmanaged/broad access groups (Users, Everyone, Authenticated Users)
                try
                {
                    var rulesToRemove = new List<FileSystemAccessRule>();
                    foreach (FileSystemAccessRule rule in dSec.GetAccessRules(true, false, typeof(NTAccount)))
                    {
                        string identity = rule.IdentityReference.Value;
                        if (identity.EndsWith(@"\Users", StringComparison.OrdinalIgnoreCase) ||
                            identity.Equals("Users", StringComparison.OrdinalIgnoreCase) ||
                            identity.EndsWith(@"\Everyone", StringComparison.OrdinalIgnoreCase) ||
                            identity.Equals("Everyone", StringComparison.OrdinalIgnoreCase) ||
                            identity.IndexOf("Authenticated Users", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            rulesToRemove.Add(rule);
                        }
                    }

                    foreach (var r in rulesToRemove)
                    {
                        try { dSec.RemoveAccessRuleSpecific(r); } catch { }
                    }
                }
                catch (Exception exPurge)
                {
                    Log("Notice during purge of broad groups on drive root: " + exPurge.Message, "WARN");
                }

                // 3. Ensure Administrators and SYSTEM retain Full Control
                try
                {
                    dSec.AddAccessRule(new FileSystemAccessRule(
                        new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
                        FileSystemRights.FullControl,
                        inheritFlags,
                        propFlags,
                        AccessControlType.Allow));
                }
                catch { }

                try
                {
                    dSec.AddAccessRule(new FileSystemAccessRule(
                        new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                        FileSystemRights.FullControl,
                        inheritFlags,
                        propFlags,
                        AccessControlType.Allow));
                }
                catch { }

                try
                {
                    dSec.AddAccessRule(new FileSystemAccessRule(
                        "superclient",
                        FileSystemRights.FullControl,
                        inheritFlags,
                        propFlags,
                        AccessControlType.Allow));
                }
                catch { }

                // 4. Grant Target Client User List/Read on root (non-propagating, so they can open drive icon in Explorer)
                if (!string.IsNullOrEmpty(username))
                {
                    try
                    {
                        dSec.AddAccessRule(new FileSystemAccessRule(
                            username,
                            FileSystemRights.ReadAndExecute | FileSystemRights.ListDirectory,
                            InheritanceFlags.None,
                            PropagationFlags.None,
                            AccessControlType.Allow));
                    }
                    catch (Exception exUser)
                    {
                        Log("Notice assigning user drive ACL in .NET: " + exUser.Message, "WARN");
                    }
                }

                dInfo.SetAccessControl(dSec);
                Log(string.Format("Drive-Level NTFS ACL successfully committed via .NET on '{0}' for '{1}'.", driveRoot, string.IsNullOrEmpty(username) ? "SYSTEM/ADMIN" : username), "SUCCESS");

                // 5. Defense-in-depth: native icacls enforcement to guarantee complete purge of Users/Everyone
                try
                {
                    RunProcess("icacls.exe", BuildArgs(driveRoot, "/inheritance:r"));
                    RunProcess("icacls.exe", BuildArgs(driveRoot, "/remove:g", "Users", "Everyone", "Authenticated Users", "/q"));
                    RunProcess("icacls.exe", BuildArgs(driveRoot, "/grant:r", "Administrators:(OI)(CI)F", "SYSTEM:(OI)(CI)F", "superclient:(OI)(CI)F", "/q"));
                    if (!string.IsNullOrEmpty(username))
                    {
                        RunProcess("icacls.exe", BuildArgs(driveRoot, "/grant", username + ":(NP)(RX)", "/q"));
                    }
                    Log(string.Format("Native icacls enforcement completed on '{0}'.", driveRoot), "SUCCESS");
                }
                catch (Exception exIcacls)
                {
                    Log("Notice during native icacls execution: " + exIcacls.Message, "WARN");
                }
            }
            catch (Exception ex)
            {
                Log("Drive-Level NTFS Isolation error: " + ex.Message, "WARN");
            }
        }

        #endregion

        #region TSplus Automation Helper

        private class TSplusIniSection
        {
            public string Header = "";
            public int AppNumber = -1;
            public List<string> Lines = new List<string>();
            public Dictionary<string, string> KeyValues = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            public string GetValue(string key)
            {
                string val;
                return KeyValues.TryGetValue(key, out val) ? val : "";
            }

            public void SetValue(string key, string val)
            {
                KeyValues[key] = val;
                bool found = false;
                for (int i = 0; i < Lines.Count; i++)
                {
                    string line = Lines[i].Trim();
                    if (line.StartsWith(key + "=", StringComparison.OrdinalIgnoreCase))
                    {
                        Lines[i] = key + "=" + val;
                        found = true;
                        break;
                    }
                }
                if (!found)
                {
                    Lines.Add(key + "=" + val);
                }
            }
        }

        private static string AddUserToSemicolonList(string list, string username)
        {
            string machine = Environment.MachineName;
            string fullUser = machine + "\\" + username;

            if (string.IsNullOrEmpty(list)) return fullUser;

            string normalized = list.Replace(',', ';');
            string[] parts = normalized.Split(new char[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            List<string> cleanList = new List<string>();
            bool alreadyThere = false;

            foreach (var p in parts)
            {
                string t = p.Trim();
                if (string.IsNullOrEmpty(t)) continue;
                if (!t.Contains("\\"))
                {
                    t = machine + "\\" + t;
                }

                if (t.Equals(fullUser, StringComparison.OrdinalIgnoreCase) || t.Equals(username, StringComparison.OrdinalIgnoreCase))
                {
                    alreadyThere = true;
                    if (!cleanList.Contains(fullUser)) cleanList.Add(fullUser);
                }
                else
                {
                    if (!cleanList.Contains(t)) cleanList.Add(t);
                }
            }

            if (!alreadyThere)
            {
                cleanList.Add(fullUser);
            }

            return string.Join(";", cleanList.ToArray());
        }

        private static string RemoveUserFromSemicolonList(string list, string username)
        {
            if (string.IsNullOrEmpty(list)) return "";
            string machine = Environment.MachineName;
            string fullUser = machine + "\\" + username;

            string normalized = list.Replace(',', ';');
            string[] parts = normalized.Split(new char[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            List<string> kept = new List<string>();
            foreach (var p in parts)
            {
                string t = p.Trim();
                if (string.IsNullOrEmpty(t)) continue;
                if (!t.Equals(fullUser, StringComparison.OrdinalIgnoreCase) && 
                    !t.Equals(username, StringComparison.OrdinalIgnoreCase) &&
                    !t.EndsWith("\\" + username, StringComparison.OrdinalIgnoreCase))
                {
                    kept.Add(t);
                }
            }
            return string.Join(";", kept.ToArray());
        }

        private static void ConfigureTSplusApplication(string companyName, string sanitizedFolder, string username, string driveLetter, string companyRoot, string tallyDir)
        {
            try
            {
                string[] iniCandidates = new string[]
                {
                    @"C:\Program Files (x86)\TSplus\UserDesktop\files\AppControl.ini",
                    @"C:\Program Files\TSplus\UserDesktop\files\AppControl.ini",
                    @"C:\wsession\AppControl.ini"
                };

                string iniPath = null;
                foreach (var p in iniCandidates)
                {
                    if (File.Exists(p)) { iniPath = p; break; }
                }

                if (string.IsNullOrEmpty(iniPath))
                {
                    Log("TSplus AppControl.ini not found. Skipping TSplus configuration.", "INFO");
                    return;
                }

                // Backup AppControl.ini before modification
                try
                {
                    string bakDir = Path.GetDirectoryName(iniPath);
                    string backupFile = Path.Combine(bakDir, "AppControl.ini.bak_last");
                    File.Copy(iniPath, backupFile, true);
                }
                catch { }

                string[] rawLines = File.ReadAllLines(iniPath, Encoding.Default);
                List<TSplusIniSection> sections = new List<TSplusIniSection>();
                List<string> preamble = new List<string>();
                TSplusIniSection currentSection = null;
                int maxAppIndex = 0;

                foreach (string rawLine in rawLines)
                {
                    string trimmed = rawLine.Trim();
                    if (trimmed.StartsWith("[") && trimmed.EndsWith("]"))
                    {
                        currentSection = new TSplusIniSection();
                        currentSection.Header = trimmed;
                        if (trimmed.StartsWith("[App", StringComparison.OrdinalIgnoreCase))
                        {
                            string numStr = trimmed.Substring(4, trimmed.Length - 5);
                            int n;
                            if (int.TryParse(numStr, out n))
                            {
                                currentSection.AppNumber = n;
                                if (n > maxAppIndex) maxAppIndex = n;
                            }
                        }
                        sections.Add(currentSection);
                    }
                    else
                    {
                        if (currentSection == null)
                        {
                            preamble.Add(rawLine);
                        }
                        else
                        {
                            currentSection.Lines.Add(rawLine);
                            int eqIdx = trimmed.IndexOf('=');
                            if (eqIdx > 0)
                            {
                                string k = trimmed.Substring(0, eqIdx).Trim();
                                string v = trimmed.Substring(eqIdx + 1).Trim();
                                currentSection.KeyValues[k] = v;
                            }
                        }
                    }
                }

                // Locate TSplus binaries (floatingpanel.exe and folder.exe)
                string tsplusFilesDir = Path.GetDirectoryName(iniPath);
                string floatingExe = Path.Combine(tsplusFilesDir, "floatingpanel.exe");
                if (!File.Exists(floatingExe))
                {
                    string altFp = @"C:\Program Files (x86)\TSplus\UserDesktop\files\floatingpanel.exe";
                    if (File.Exists(altFp)) floatingExe = altFp;
                }

                // Explicitly grant NTFS Read & Execute permission on floatingpanel.exe so Windows never blocks execution
                try
                {
                    if (File.Exists(floatingExe))
                    {
                        var fi = new FileInfo(floatingExe);
                        var fSec = fi.GetAccessControl();
                        fSec.AddAccessRule(new FileSystemAccessRule(username, FileSystemRights.ReadAndExecute, AccessControlType.Allow));
                        fi.SetAccessControl(fSec);
                        Log("Granted explicit NTFS Read & Execute permission on floatingpanel.exe to user '" + username + "'.", "TSPLUS");
                    }
                }
                catch (Exception exFpAcl)
                {
                    Log("Notice configuring NTFS ACL on floatingpanel.exe: " + exFpAcl.Message, "WARN");
                }

                string machineUser = Environment.MachineName + "\\" + username;

                // 1. Assign FloatingPanel & remove from Microsoft Remote Desktop
                bool floatingPanelFound = false;
                foreach (var sec in sections)
                {
                    string appname = sec.GetValue("appname").Trim();
                    if (appname.Equals("FloatingPanel", StringComparison.OrdinalIgnoreCase) ||
                        appname.Equals("Floating Panel", StringComparison.OrdinalIgnoreCase))
                    {
                        sec.SetValue("users", AddUserToSemicolonList(sec.GetValue("users"), username));
                        if (File.Exists(floatingExe) && string.IsNullOrEmpty(sec.GetValue("path")))
                        {
                            sec.SetValue("path", floatingExe);
                            sec.SetValue("startup", tsplusFilesDir);
                        }
                        floatingPanelFound = true;
                        Log("User '" + machineUser + "' assigned to TSplus FloatingPanel.", "TSPLUS");
                    }
                    if (appname.Equals("Microsoft Remote Desktop", StringComparison.OrdinalIgnoreCase))
                    {
                        string cur = sec.GetValue("users");
                        string updated = RemoveUserFromSemicolonList(cur, username);
                        if (updated != cur)
                        {
                            sec.SetValue("users", updated);
                            Log("User '" + machineUser + "' removed from Microsoft Remote Desktop (Floating Panel priority).", "TSPLUS");
                        }
                    }
                }

                if (!floatingPanelFound)
                {
                    maxAppIndex++;
                    TSplusIniSection newFpApp = new TSplusIniSection();
                    newFpApp.Header = "[App" + maxAppIndex + "]";
                    newFpApp.AppNumber = maxAppIndex;
                    newFpApp.SetValue("appname", "FloatingPanel");
                    newFpApp.SetValue("path", File.Exists(floatingExe) ? floatingExe : @"C:\Program Files (x86)\TSplus\UserDesktop\FloatingPanel.exe");
                    newFpApp.SetValue("startup", tsplusFilesDir);
                    newFpApp.SetValue("cmdline", "");
                    newFpApp.SetValue("groups", "");
                    newFpApp.SetValue("users", machineUser);
                    newFpApp.SetValue("maximized", "no");
                    newFpApp.SetValue("minimized", "no");
                    newFpApp.SetValue("hide", "no");
                    newFpApp.SetValue("all_users", "no");
                    newFpApp.SetValue("folder", "");
                    sections.Add(newFpApp);
                    Log("Created new FloatingPanel application block: " + newFpApp.Header, "TSPLUS");
                }

                // 2. Publish / Assign Tally Application
                string tallyAppName = sanitizedFolder + "_TallyPrime";
                string tallyExe = Path.Combine(companyRoot, "tally.exe");
                if (!File.Exists(tallyExe))
                {
                    if (File.Exists(Path.Combine(tallyDir, "tally.exe")))
                        tallyExe = Path.Combine(tallyDir, "tally.exe");
                    else if (File.Exists(Path.Combine(companyRoot, "TallyPrime", "tally.exe")))
                        tallyExe = Path.Combine(companyRoot, "TallyPrime", "tally.exe");
                }
                string tallyStartup = Path.GetDirectoryName(tallyExe);

                TSplusIniSection tallySec = null;
                foreach (var sec in sections)
                {
                    string an = sec.GetValue("appname").Trim();
                    if (an.Equals(tallyAppName, StringComparison.OrdinalIgnoreCase) ||
                        an.Equals(sanitizedFolder + "_Tally", StringComparison.OrdinalIgnoreCase))
                    {
                        tallySec = sec;
                        break;
                    }
                }

                if (tallySec != null)
                {
                    tallySec.SetValue("users", AddUserToSemicolonList(tallySec.GetValue("users"), username));
                    if (File.Exists(tallyExe))
                    {
                        tallySec.SetValue("path", tallyExe);
                        tallySec.SetValue("startup", tallyStartup);
                    }
                    Log("User '" + machineUser + "' assigned to existing TSplus Tally app: " + tallySec.Header, "TSPLUS");
                }
                else
                {
                    maxAppIndex++;
                    TSplusIniSection newTallyApp = new TSplusIniSection();
                    newTallyApp.Header = "[App" + maxAppIndex + "]";
                    newTallyApp.AppNumber = maxAppIndex;
                    newTallyApp.SetValue("appname", tallyAppName);
                    newTallyApp.SetValue("path", tallyExe);
                    newTallyApp.SetValue("startup", tallyStartup);
                    newTallyApp.SetValue("cmdline", "");
                    newTallyApp.SetValue("groups", "");
                    newTallyApp.SetValue("users", machineUser);
                    newTallyApp.SetValue("maximized", "no");
                    newTallyApp.SetValue("minimized", "no");
                    newTallyApp.SetValue("hide", "no");
                    newTallyApp.SetValue("all_users", "no");
                    newTallyApp.SetValue("folder", "");
                    sections.Add(newTallyApp);
                    Log("Created new TSplus Tally app: " + newTallyApp.Header + " (" + tallyAppName + ")", "TSPLUS");
                }

                // 3. Publish / Assign Company Folder Application
                string folderExe = @"C:\Program Files (x86)\TSplus\UserDesktop\files\folder.exe";
                if (!File.Exists(folderExe))
                {
                    string alt = @"C:\Program Files\TSplus\UserDesktop\files\folder.exe";
                    if (File.Exists(alt)) folderExe = alt;
                    else folderExe = @"C:\Windows\explorer.exe";
                }

                try
                {
                    if (File.Exists(folderExe))
                    {
                        var fi = new FileInfo(folderExe);
                        var fSec = fi.GetAccessControl();
                        fSec.AddAccessRule(new FileSystemAccessRule(username, FileSystemRights.ReadAndExecute, AccessControlType.Allow));
                        fi.SetAccessControl(fSec);
                        Log("Granted explicit NTFS Read & Execute permission on folder.exe to user '" + username + "'.", "TSPLUS");
                    }
                }
                catch (Exception exFoldAcl)
                {
                    Log("Notice configuring NTFS ACL on folder.exe: " + exFoldAcl.Message, "WARN");
                }
                string folderStartup = Path.GetDirectoryName(folderExe);
                string folderAppName = sanitizedFolder + "_Folder";

                TSplusIniSection folderSec = null;
                foreach (var sec in sections)
                {
                    string an = sec.GetValue("appname").Trim();
                    string cl = sec.GetValue("cmdline").Trim();
                    if (an.Equals(folderAppName, StringComparison.OrdinalIgnoreCase) ||
                        an.Equals(sanitizedFolder, StringComparison.OrdinalIgnoreCase) ||
                        cl.Equals(companyRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        folderSec = sec;
                        break;
                    }
                }

                if (folderSec != null)
                {
                    folderSec.SetValue("users", AddUserToSemicolonList(folderSec.GetValue("users"), username));
                    folderSec.SetValue("cmdline", companyRoot);
                    Log("User '" + machineUser + "' assigned to existing TSplus Folder app: " + folderSec.Header, "TSPLUS");
                }
                else
                {
                    maxAppIndex++;
                    TSplusIniSection newFolderApp = new TSplusIniSection();
                    newFolderApp.Header = "[App" + maxAppIndex + "]";
                    newFolderApp.AppNumber = maxAppIndex;
                    newFolderApp.SetValue("appname", folderAppName);
                    newFolderApp.SetValue("path", folderExe);
                    newFolderApp.SetValue("startup", folderStartup);
                    newFolderApp.SetValue("cmdline", companyRoot);
                    newFolderApp.SetValue("groups", "");
                    newFolderApp.SetValue("users", machineUser);
                    newFolderApp.SetValue("maximized", "no");
                    newFolderApp.SetValue("minimized", "no");
                    newFolderApp.SetValue("hide", "no");
                    newFolderApp.SetValue("all_users", "no");
                    newFolderApp.SetValue("folder", "");
                    sections.Add(newFolderApp);
                    Log("Created new TSplus Folder app: " + newFolderApp.Header + " (" + folderAppName + ")", "TSPLUS");
                }

                // 4. Write back AppControl.ini
                List<string> outLines = new List<string>();
                outLines.AddRange(preamble);
                foreach (var sec in sections)
                {
                    outLines.Add(sec.Header);
                    outLines.AddRange(sec.Lines);
                }
                File.WriteAllLines(iniPath, outLines.ToArray(), Encoding.Default);
                Log(string.Format("TSplus configuration written successfully to {0} ({1} apps).", iniPath, sections.Count), "SUCCESS");
            }
            catch (Exception ex)
            {
                Log("ConfigureTSplusApplication error: " + ex.Message, "ERROR");
            }
        }

        #endregion

        #region Auto-Update Engine

        private static string GetFileSha256(string filePath)
        {
            try
            {
                if (!File.Exists(filePath)) return "";
                using (var sha = System.Security.Cryptography.SHA256.Create())
                using (var stream = File.OpenRead(filePath))
                {
                    byte[] hash = sha.ComputeHash(stream);
                    return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
                }
            }
            catch { return ""; }
        }

        private static void CheckAndApplyAutoUpdate()
        {
            try
            {
                ConfigureSecurityProtocols();
                string updateUrl = string.Format("{0}/InnovationVpsAgent.exe?serverId={1}", _portalBase.TrimEnd('/'), Uri.EscapeDataString(_serverId));

                string tempFile = Path.Combine(_appDir, "InnovationVpsAgent.new");

                using (var wc = new TimeoutWebClient(15000))
                {
                    wc.Headers["User-Agent"] = "InnovationVpsUpdater/3.0";
                    wc.DownloadFile(updateUrl, tempFile);
                }

                if (File.Exists(tempFile))
                {
                    var fi = new FileInfo(tempFile);
                    if (fi.Length > 20000) // Valid exe
                    {
                        string currentExe = Process.GetCurrentProcess().MainModule.FileName;

                        // Critical: Only update if file hash has actually changed!
                        // Prevents stopping the service every 30 minutes when already up to date.
                        string curHash = GetFileSha256(currentExe);
                        string newHash = GetFileSha256(tempFile);
                        if (!string.IsNullOrEmpty(curHash) && curHash.Equals(newHash, StringComparison.OrdinalIgnoreCase))
                        {
                            try { File.Delete(tempFile); } catch { }
                            return; // Binary is identical. Keep running uninterrupted!
                        }

                        string batchUpdater = Path.Combine(_appDir, "update_service.bat");

                        // Session 0-safe retry loop with ping delay (timeout is blocked in Session 0)
                        string bat = string.Format(
                            "@echo off\r\n" +
                            "set count=0\r\n" +
                            "ping 127.0.0.1 -n 2 >nul\r\n" +
                            "net stop {0} >nul 2>&1\r\n" +
                            "taskkill /f /im InnovationVpsAgent.exe >nul 2>&1\r\n" +
                            ":retry\r\n" +
                            "set /a count+=1\r\n" +
                            "ping 127.0.0.1 -n 2 >nul\r\n" +
                            "move /y \"{1}\" \"{2}\" >nul 2>&1\r\n" +
                            "if not exist \"{1}\" goto started\r\n" +
                            "if %count% lss 10 goto retry\r\n" +
                            "del /f /q \"{1}\" >nul 2>&1\r\n" +
                            ":started\r\n" +
                            "net start {0}\r\n" +
                            "del \"%~f0\"\r\n",
                            SERVICE_NAME, tempFile, currentExe);

                        File.WriteAllText(batchUpdater, bat);
                        Process.Start(new ProcessStartInfo("cmd.exe", "/c \"" + batchUpdater + "\"") { CreateNoWindow = true, UseShellExecute = false });
                        Log("[+] New agent version detected. Applying self-update...", "UPDATE");

                        ThreadPool.QueueUserWorkItem((s) => {
                            Thread.Sleep(800);
                            Environment.Exit(0);
                        });
                    }
                    else
                    {
                        try { File.Delete(tempFile); } catch { }
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Auto-update check notice: " + ex.Message, "WARN");
            }
        }

        #endregion

        #region Helpers & Config

        private static void ConfigureSecurityProtocols()
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768 | (SecurityProtocolType)192;
            ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
            ServicePointManager.DefaultConnectionLimit = 64;
            ServicePointManager.Expect100Continue = false;
            ServicePointManager.UseNagleAlgorithm = false;
            ServicePointManager.MaxServicePointIdleTime = 2000;
            WebRequest.DefaultWebProxy = null;
        }

        private static void LoadConfig()
        {
            try
            {
                if (File.Exists(_configFile))
                {
                    string json = File.ReadAllText(_configFile);
                    var serializer = new JavaScriptSerializer();
                    var cfg = serializer.Deserialize<Dictionary<string, object>>(json);
                    if (cfg != null)
                    {
                        if (cfg.ContainsKey("serverId") && !string.IsNullOrEmpty(Convert.ToString(cfg["serverId"])))
                            _serverId = Convert.ToString(cfg["serverId"]);
                        if (cfg.ContainsKey("serverToken") && !string.IsNullOrEmpty(Convert.ToString(cfg["serverToken"])))
                            _serverToken = Convert.ToString(cfg["serverToken"]);
                        if (cfg.ContainsKey("portalBase") && !string.IsNullOrEmpty(Convert.ToString(cfg["portalBase"])))
                            _portalBase = Convert.ToString(cfg["portalBase"]);
                        if (cfg.ContainsKey("agentKey") && cfg["agentKey"] != null)
                            _agentKey = Convert.ToString(cfg["agentKey"]).Trim();
                        if (cfg.ContainsKey("intervalSeconds"))
                            _intervalSeconds = Convert.ToInt32(cfg["intervalSeconds"]);
                    }
                }
            }
            catch { }
        }

        public static void SaveConfig(string serverId, string portalBase, string serverToken = "vps_sec_token_default", int interval = 5, string agentKey = null)
        {
            try { SaveConfigCore(serverId, portalBase, serverToken, interval, agentKey); }
            catch { }
        }

        // Writes the config to a temp file (SYSTEM + Administrators ACL applied), then replaces
        // agent-config.json atomically. Throws on failure; the old file and in-memory key are
        // left untouched until the replace succeeds. Never logs the key.
        private static void SaveConfigCore(string serverId, string portalBase, string serverToken, int interval, string agentKey)
        {
            {
                Directory.CreateDirectory(_appDir);

                // Preserve the existing agentKey unless a new one is supplied
                string keyToStore = agentKey;
                if (keyToStore == null)
                {
                    keyToStore = _agentKey;
                    try
                    {
                        if (string.IsNullOrEmpty(keyToStore) && File.Exists(_configFile))
                        {
                            var existing = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(_configFile));
                            if (existing != null && existing.ContainsKey("agentKey") && existing["agentKey"] != null)
                                keyToStore = Convert.ToString(existing["agentKey"]).Trim();
                        }
                    }
                    catch { }
                }
                if (keyToStore == null) keyToStore = "";

                var cfg = new Dictionary<string, object>
                {
                    { "serverId", serverId },
                    { "portalBase", portalBase },
                    { "serverToken", serverToken },
                    { "agentKey", keyToStore },
                    { "intervalSeconds", interval }
                };
                var serializer = new JavaScriptSerializer();
                string tmpFile = _configFile + ".tmp";
                try
                {
                    File.WriteAllText(tmpFile, serializer.Serialize(cfg));
                    ApplyConfigAcl(tmpFile);
                    if (File.Exists(_configFile))
                        File.Replace(tmpFile, _configFile, null);
                    else
                        File.Move(tmpFile, _configFile);
                }
                finally
                {
                    try { if (File.Exists(tmpFile)) File.Delete(tmpFile); } catch { }
                }
                _agentKey = keyToStore;
                ApplyConfigAcl(_configFile);
            }
        }

        // ACTION SET_AGENT_KEY helper: installs a new per-server Agent_Key. Returns null on success, else an error text (never contains the key).
        private static string InstallAgentKey(string newKey)
        {
            if (string.IsNullOrEmpty(newKey) || !System.Text.RegularExpressions.Regex.IsMatch(newKey, @"^ak_[A-Za-z0-9_-]{43}$"))
                return "Invalid agent key format; key not installed.";
            try
            {
                SaveConfigCore(_serverId, _portalBase, _serverToken, _intervalSeconds, newKey);
                return null;
            }
            catch (Exception ex)
            {
                return "Failed to write agent-config.json (" + ex.GetType().Name + "); old key kept.";
            }
        }

        public static void Log(string message, string level = "INFO")
        {
            try
            {
                Directory.CreateDirectory(_appDir);
                string ts = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string line = string.Format("[{0}] [{1}] {2}", ts, level, message);
                Console.WriteLine(line);
                File.AppendAllText(_logFile, line + Environment.NewLine);
            }
            catch { }
        }

        private static int RunProcess(string exe, string args)
        {
            try
            {
                var psi = new ProcessStartInfo(exe, args)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                using (var p = Process.Start(psi))
                {
                    p.WaitForExit(10000);
                    return p.ExitCode;
                }
            }
            catch { return -1; }
        }

        private static string RunProcessWithOutput(string exe, string args)
        {
            try
            {
                var psi = new ProcessStartInfo(exe, args)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                using (var p = new Process { StartInfo = psi })
                {
                    var sbOut = new StringBuilder();
                    var sbErr = new StringBuilder();

                    using (var outWait = new AutoResetEvent(false))
                    using (var errWait = new AutoResetEvent(false))
                    {
                        p.OutputDataReceived += (s, e) => {
                            if (e.Data == null) outWait.Set();
                            else sbOut.AppendLine(e.Data);
                        };
                        p.ErrorDataReceived += (s, e) => {
                            if (e.Data == null) errWait.Set();
                            else sbErr.AppendLine(e.Data);
                        };

                        if (!p.Start()) return "";
                        p.BeginOutputReadLine();
                        p.BeginErrorReadLine();

                        // Enforce max 6 seconds timeout so agent loop NEVER hangs
                        if (p.WaitForExit(6000) && outWait.WaitOne(6000) && errWait.WaitOne(6000))
                        {
                            return (sbOut.ToString() + " " + sbErr.ToString()).Trim();
                        }
                        else
                        {
                            try { p.Kill(); } catch { }
                            return sbOut.ToString().Trim();
                        }
                    }
                }
            }
            catch (Exception ex) { return "ERROR: " + ex.Message; }
        }

        private static string ExecutePowerShell(string script)
        {
            try
            {
                string tmpPs = Path.Combine(Path.GetTempPath(), "run_ps_" + Guid.NewGuid().ToString("N") + ".ps1");
                File.WriteAllText(tmpPs, script);
                string res = RunProcessWithOutput("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + tmpPs + "\"");
                try { File.Delete(tmpPs); } catch { }
                return res;
            }
            catch { return ""; }
        }

        // ---- Hardening (task 16.7): argument quoting + allowlist validation ----

        // Same allowlist the portal applies to job usernames (no spaces, no quotes, no shell metacharacters).
        private static bool IsSafeUsername(string u)
        {
            return !string.IsNullOrEmpty(u) && System.Text.RegularExpressions.Regex.IsMatch(u, @"^[A-Za-z0-9_.$][A-Za-z0-9_.$-]{0,39}$");
        }

        // Drive roots such as "C:" or "C:\" only.
        private static bool IsSafeDriveRoot(string d)
        {
            return !string.IsNullOrEmpty(d) && System.Text.RegularExpressions.Regex.IsMatch(d, @"^[A-Za-z]:\\?$");
        }

        // Quotes one argument per CommandLineToArgvW rules so a quote or trailing backslash cannot break out.
        private static string QuoteArg(string a)
        {
            if (a == null) a = "";
            if (a.Length > 0 && a.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0) return a;
            var sb = new StringBuilder();
            sb.Append('"');
            int bs = 0;
            foreach (char c in a)
            {
                if (c == '\\') { bs++; }
                else if (c == '"') { sb.Append('\\', bs * 2 + 1); sb.Append('"'); bs = 0; }
                else { if (bs > 0) { sb.Append('\\', bs); bs = 0; } sb.Append(c); }
            }
            if (bs > 0) sb.Append('\\', bs * 2);
            sb.Append('"');
            return sb.ToString();
        }

        // .NET Framework 4 has no ProcessStartInfo.ArgumentList, so build a safely quoted argument string.
        private static string BuildArgs(params string[] args)
        {
            var parts = new string[args.Length];
            for (int i = 0; i < args.Length; i++) parts[i] = QuoteArg(args[i]);
            return string.Join(" ", parts);
        }

        // Runs a PowerShell script via -EncodedCommand (UTF-16LE base64); no file, no command-line quoting.
        private static string ExecutePowerShellEncoded(string script)
        {
            try
            {
                string enc = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
                return RunProcessWithOutput("powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + enc);
            }
            catch { return ""; }
        }

        #endregion

        #region CLI & Service Controller

        public static void Main(string[] args)
        {
            string command = (args.Length > 0) ? args[0].ToLowerInvariant() : "-service";

            if (command == "-install" || command == "/install" || command == "--install")
            {
                InstallServiceCLI(args);
                return;
            }

            if (command == "-uninstall" || command == "/uninstall" || command == "--uninstall")
            {
                UninstallServiceCLI();
                return;
            }

            if (command == "-status" || command == "/status")
            {
                PrintStatusCLI();
                return;
            }

            if (command == "-console" || command == "-debug")
            {
                Console.WriteLine("Running Innovation VPS Agent in Console Debug mode. Press Ctrl+C to stop...");
                var service = new VpsAgentService();
                service.OnStart(args);
                Thread.Sleep(Timeout.Infinite);
                return;
            }

            // Normal Windows Service Run
            ServiceBase.Run(new VpsAgentService());
        }

        private static void InstallServiceCLI(string[] args)
        {
            Console.WriteLine("==========================================================================");
            Console.WriteLine("   INSTALLING INNOVATION VPS AGENT AS PERMANENT WINDOWS SERVICE           ");
            Console.WriteLine("==========================================================================");

            string srvId = "auto";
            string portal = "https://vps.innovationwebworks.in";

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i].Equals("-serverid", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length) srvId = args[i + 1];
                if (args[i].Equals("-portal", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length) portal = args[i + 1];
            }

            try
            {
                Directory.CreateDirectory(_appDir);
                string targetExe = Path.Combine(_appDir, "InnovationVpsAgent.exe");
                string currentExe = Process.GetCurrentProcess().MainModule.FileName;

                if (!currentExe.Equals(targetExe, StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(currentExe, targetExe, true);
                    Console.WriteLine(" [+] Installed binary to: " + targetExe);
                }

                SaveConfig(srvId, portal);
                Console.WriteLine(" [+] Saved Configuration: ServerId = " + srvId + ", Portal = " + portal);

                // Stop & delete if old instance exists
                RunProcess("net.exe", "stop " + SERVICE_NAME);
                RunProcess("sc.exe", "delete " + SERVICE_NAME);
                Thread.Sleep(1000);

                // 1. Create Windows Service cleanly without nested double-quotes
                RunProcess("sc.exe", string.Format("create {0} binPath= \"{1}\" start= auto DisplayName= \"{2}\"", SERVICE_NAME, targetExe, DISPLAY_NAME));
                RunProcess("sc.exe", string.Format("description {0} \"{1}\"", SERVICE_NAME, DESCRIPTION));

                // 2. Set clean ImagePath in Registry to eliminate any quoting or path escape bugs (prevents Error 193: 0xc1)
                try
                {
                    using (var rk = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + SERVICE_NAME, true))
                    {
                        if (rk != null)
                        {
                            rk.SetValue("ImagePath", "\"" + targetExe + "\"", Microsoft.Win32.RegistryValueKind.ExpandString);
                        }
                    }
                }
                catch {}

                // 3. Configure Crash-Recovery in Windows Service Control Manager:
                // Reset failure count after 86400 seconds (24h). 1s on 1st failure, 2s on 2nd, 5s on 3rd & subsequent.
                RunProcess("sc.exe", string.Format("failure \"{0}\" reset= 86400 actions= restart/1000/restart/2000/restart/5000", SERVICE_NAME));
                RunProcess("sc.exe", string.Format("failureflag \"{0}\" 1", SERVICE_NAME));

                // 4. Create Guardian Watchdog Scheduled Task (Runs every 1 minute under SYSTEM as secondary safety net)
                try
                {
                    string guardianCmd = string.Format("schtasks.exe /create /tn \"InnovationVpsAgentGuardian\" /tr \"cmd.exe /c net start {0}\" /sc minute /mo 1 /ru \"NT AUTHORITY\\SYSTEM\" /f /rl HIGHEST", SERVICE_NAME);
                    RunProcess("cmd.exe", "/c " + guardianCmd);
                }
                catch { }

                // 5. Start the service
                RunProcess("net.exe", "start " + SERVICE_NAME);

                Console.WriteLine("\n==========================================================================");
                Console.WriteLine(" [OK] SUCCESS: Innovation VPS Agent is now running in services.msc!");
                Console.WriteLine("   Service Name  : " + SERVICE_NAME);
                Console.WriteLine("   Display Name  : " + DISPLAY_NAME);
                Console.WriteLine("   Startup Type  : Automatic (Starts at boot before user login)");
                Console.WriteLine("   Crash Recovery: Windows OS auto-restarts within 1 second!");
                Console.WriteLine("   Watchdog Task : 1-Minute Fail-Safe Guardian Active");
                Console.WriteLine("   Log File      : " + _logFile);
                Console.WriteLine("==========================================================================");
                Console.WriteLine(" [i] You can safely LOG OFF from RDP. The Windows Service will NEVER stop.\n");
            }
            catch (Exception ex)
            {
                Console.WriteLine(" [X] Installation failed: " + ex.Message);
            }
        }

        private static void UninstallServiceCLI()
        {
            Console.WriteLine("[*] Stopping and uninstalling " + SERVICE_NAME + "...");
            try { RunProcess("schtasks.exe", "/delete /tn \"InnovationVpsAgentGuardian\" /f"); } catch { }
            RunProcess("net.exe", "stop " + SERVICE_NAME);
            RunProcess("sc.exe", "delete " + SERVICE_NAME);
            Console.WriteLine("[OK] Service uninstalled successfully.");
        }

        private static void PrintStatusCLI()
        {
            try
            {
                using (var sc = new ServiceController(SERVICE_NAME))
                {
                    Console.WriteLine("Service Status: " + sc.Status);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Could not query service: " + ex.Message);
            }
        }

        #endregion
    }
}
