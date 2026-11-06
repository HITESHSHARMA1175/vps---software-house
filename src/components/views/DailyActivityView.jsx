import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Calendar,
  UserCheck,
  UserX,
  AlertTriangle,
  Server,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Filter,
  Activity,
  ShieldCheck,
  Zap,
  User,
  Radio,
  ArrowUpRight,
  Copy,
  Check,
  Hourglass,
  Users,
  Sparkles,
  Terminal,
  Layers,
  Globe,
  TrendingUp,
  KeyRound,
  Download,
  FileSpreadsheet,
  X,
  History,
  Eye,
  CalendarClock
} from 'lucide-react';
import { exportDailyUserActivityExcel } from '../../utils/exportUtils';

const BOGUS_FRAGMENTS = new Set([
  'hgoyal', 'tahir_hu', 'aurav', 'hal', 'hrizari', 'ain', '-3', '-2', 
  'fir', 'mi', 'amyak', 'anto', 'er4', 'er4 vi', 'true u', 'trator agarwal', 
  'defaultaccount deviram fir', 't-fly2 garp gue', 'hari_om1 hari_om2 hrpl', 
  'h mg1 mg2', 'hrpl-2 hrpl-3 htr', 'power prateek ritik', 'newds', 'kkjhjmhgvhb', 
  'juist chill', 'mann', 'administrator', 'guest', 'defaultaccount', 'wdagutilityaccount'
]);

function isValidWindowsUsername(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  const lower = clean.toLowerCase();
  if (clean.startsWith('-') || clean.length < 2) return false;
  if (BOGUS_FRAGMENTS.has(lower) || lower.includes('cheetah')) return false;
  return true;
}

function normalizeUsernameKey(name = '') {
  return String(name || '').toLowerCase().replace(/[\s_\-\.]+/g, '').trim();
}

// Generate rich gradient colors for avatars based on username
function getAvatarGradient(username = '') {
  const gradients = [
    'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    'linear-gradient(135deg, #10b981 0%, #047857 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
    'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)'
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DailyActivityView({
  servers = [],
  users = [],
  telemetryData = {},
  onDirectRemoteConnect,
  onRefreshTelemetry
}) {
  const [currentDateStr, setCurrentDateStr] = useState(() => getLocalDateString(new Date()));
  useEffect(() => {
    const updateToday = () => {
      const nowStr = getLocalDateString(new Date());
      if (nowStr !== currentDateStr) {
        setCurrentDateStr(nowStr);
      }
    };
    const timer = setInterval(updateToday, 5000);
    return () => clearInterval(timer);
  }, [currentDateStr]);
  const todayStr = currentDateStr;

  const [targetDate, setTargetDate] = useState(() => getLocalDateString(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServerFilter, setSelectedServerFilter] = useState('ALL');
  const [activityTabMode, setActivityTabMode] = useState('TODAY_LOGGED_IN'); // 'TODAY_LOGGED_IN', 'NOT_LOGGED_IN_TODAY', 'INACTIVE_7_DAYS', 'ALL'
  const [viewStyle, setViewStyle] = useState('GRID'); // Default to GRID for high visual impact!
  const [copiedUser, setCopiedUser] = useState(null);

  // Dynamic Historical Daily Activity Cache for Selected Date
  const [historicalDailyRecords, setHistoricalDailyRecords] = useState([]);
  const [userLastActiveMap, setUserLastActiveMap] = useState({});
  const [isLoadingDateData, setIsLoadingDateData] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchDateActivity = async () => {
      setIsLoadingDateData(true);
      try {
        const res = await fetch(`/api/reports/daily-user-activity?date=${targetDate}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            const list = Array.isArray(data) ? data : (data.reports || data.records || []);
            setHistoricalDailyRecords(list);
            if (data.userLastActiveMap) {
              setUserLastActiveMap(data.userLastActiveMap);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching historical daily activity:", err);
      } finally {
        if (isMounted) setIsLoadingDateData(false);
      }
    };

    fetchDateActivity();
    return () => { isMounted = false; };
  }, [targetDate]);

  // Live ticking timer for real-time duration updates
  const [liveClockMs, setLiveClockMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClockMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Selected user history drawer/modal state
  const [selectedHistoryUser, setSelectedHistoryUser] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userHistoryData, setUserHistoryData] = useState({ events: [], dailySummaries: [] });
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  const handleOpenUserHistory = async (rec) => {
    setSelectedHistoryUser(rec);
    setHistoryLoading(true);
    setHistoryDateFilter('');
    setUserHistoryData({ events: [], dailySummaries: [] });
    try {
      const serverRef = rec.serverId || rec.serverIp || '';
      const res = await fetch(`/api/reports/user-session-history?username=${encodeURIComponent(rec.username)}&serverId=${encodeURIComponent(serverRef)}`);
      const json = await res.json();
      if (json && json.success) {
        setUserHistoryData({
          events: json.events || [],
          dailySummaries: json.dailySummaries || []
        });
      }
    } catch (err) {
      console.error("Error fetching user session history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCopyUser = (username) => {
    navigator.clipboard.writeText(username);
    setCopiedUser(username);
    setTimeout(() => setCopiedUser(null), 2000);
  };

  // Extract detailed active session telemetry across ALL telemetry objects & servers
  // STRICT RULE: All entries MUST be keyed by composite server-user keys: `${serverId}::${lowerUsername}`
  const detailedSessionMap = useMemo(() => {
    const map = new Map();

    const registerSess = (srv, sess, tDataFallback) => {
      if (!sess || !sess.username) return;
      const raw = sess.username.trim();
      const lower = raw.toLowerCase();
      if (!isValidWindowsUsername(lower)) return;

      const sId = srv ? srv.id : (sess.serverId || tDataFallback?.serverId);
      const sIp = srv ? (srv.ipPort || srv.name) : (sess.serverIp || tDataFallback?.serverIp);
      const sName = srv ? srv.name : (sess.serverName || tDataFallback?.serverName);

      const sessInfo = {
        username: raw,
        logonTime: sess.logonTime || tDataFallback?.lastPing || 'Today',
        sessionId: sess.sessionId || 'RDP',
        state: sess.state || 'Active',
        serverId: sId,
        serverIp: sIp,
        serverName: sName
      };

      // Register under all server key aliases (e.g. ID, IP:Port, pure IP, serverName)
      const aliases = new Set();
      if (sId) aliases.add(String(sId).toLowerCase().trim());
      if (sIp) {
        aliases.add(String(sIp).toLowerCase().trim());
        aliases.add(String(sIp).split(':')[0].toLowerCase().trim());
      }
      if (sName) aliases.add(String(sName).toLowerCase().trim());

      aliases.forEach(alias => {
        map.set(`${alias}::${lower}`, sessInfo);
      });
    };

    // Provider 1: Map from servers list
    (servers || []).forEach(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      if (tData && Array.isArray(tData.detailedSessions)) {
        tData.detailedSessions.forEach(sess => registerSess(s, sess, tData));
      }
    });

    // Provider 2: Map from raw telemetryData keys
    Object.keys(telemetryData || {}).forEach(tKey => {
      const tData = telemetryData[tKey];
      if (tData && Array.isArray(tData.detailedSessions) && tData.detailedSessions.length > 0) {
        const matchedServer = (servers || []).find(s => s.id === tKey || s.ipPort === tKey || s.name === tKey || (s.ipPort && s.ipPort.split(':')[0] === tKey));
        tData.detailedSessions.forEach(sess => registerSess(matchedServer, sess, tData));
      }
    });

    return map;
  }, [servers, telemetryData]);

  // Compute live active sessions set across ALL telemetry objects & servers
  // STRICT RULE: All entries MUST be keyed by composite server-user keys: `${serverId}::${lowerUsername}`
  const activeSessionsMap = useMemo(() => {
    const activeMap = new Map();

    const registerActive = (srv, u, tDataFallback) => {
      const uName = (typeof u === 'string' ? u : u.username || u.user || '').trim();
      const lower = uName.toLowerCase();
      if (!lower || !isValidWindowsUsername(lower)) return;

      const sId = srv ? srv.id : (u.serverId || tDataFallback?.serverId);
      const sIp = srv ? (srv.ipPort || srv.name) : (u.serverIp || tDataFallback?.serverIp);
      const sName = srv ? srv.name : (u.serverName || tDataFallback?.serverName);

      const sInfo = {
        username: uName,
        serverId: sId,
        serverIp: sIp,
        serverName: sName,
        logonTime: typeof u === 'object' && u.logonTime ? u.logonTime : null,
        sessionId: typeof u === 'object' && u.sessionId ? u.sessionId : 'RDP'
      };

      // Register under all server key aliases
      const aliases = new Set();
      if (sId) aliases.add(String(sId).toLowerCase().trim());
      if (sIp) {
        aliases.add(String(sIp).toLowerCase().trim());
        aliases.add(String(sIp).split(':')[0].toLowerCase().trim());
      }
      if (sName) aliases.add(String(sName).toLowerCase().trim());

      aliases.forEach(alias => {
        activeMap.set(`${alias}::${lower}`, sInfo);
      });
    };

    // Provider 1: Map telemetryData by servers list
    (servers || []).forEach(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      if (tData && Array.isArray(tData.activeUsersList)) {
        tData.activeUsersList.forEach(u => registerActive(s, u, tData));
      }
    });

    // Provider 2: Map raw telemetryData keys
    Object.keys(telemetryData || {}).forEach(tKey => {
      const tData = telemetryData[tKey];
      if (tData && Array.isArray(tData.activeUsersList) && tData.activeUsersList.length > 0) {
        const matchedServer = (servers || []).find(s => s.id === tKey || s.ipPort === tKey || s.name === tKey || (s.ipPort && s.ipPort.split(':')[0] === tKey));
        tData.activeUsersList.forEach(u => registerActive(matchedServer, u, tData));
      }
    });

    return activeMap;
  }, [servers, telemetryData]);

  // Map daily user activity records from database reports and live telemetry
  const dailyActivityRecordsMap = useMemo(() => {
    const map = new Map();

    const registerDaily = (srv, d) => {
      if (!d || !d.username) return;
      const lower = d.username.toLowerCase().trim();
      if (!isValidWindowsUsername(lower)) return;

      // STRICT VALIDATION: Only register records where user actually logged in!
      const hasGenuineLogin = Boolean(
        (d.firstLogin && d.firstLogin !== 'N/A' && d.firstLogin !== 'null' && d.firstLogin !== '') ||
        (parseInt(d.totalUsageSeconds) > 0) ||
        (parseInt(d.sessionCount) > 0)
      );
      if (!hasGenuineLogin) return;

      const sId = srv ? srv.id : (d.serverId || (srv && srv.ipPort));
      const sIp = srv ? (srv.ipPort || srv.name) : (d.serverIp || d.serverId);
      const sName = srv ? srv.name : (d.serverName || d.serverId);

      const recordInfo = {
        ...d,
        serverId: sId,
        serverIp: sIp,
        serverName: sName
      };

      const aliases = new Set();
      if (sId) aliases.add(String(sId).toLowerCase().trim());
      if (sIp) {
        aliases.add(String(sIp).toLowerCase().trim());
        aliases.add(String(sIp).split(':')[0].toLowerCase().trim());
      }
      if (sName) aliases.add(String(sName).toLowerCase().trim());

      aliases.forEach(alias => {
        map.set(`${alias}::${lower}`, recordInfo);
      });
    };

    // 1. First register from historical database records for this targetDate
    (historicalDailyRecords || []).forEach(d => {
      const matchedServer = (servers || []).find(s => s.id === d.serverId || s.ipPort === d.serverId || s.name === d.serverId || (s.ipPort && d.serverId && s.ipPort.split(':')[0] === d.serverId.split(':')[0]));
      registerDaily(matchedServer, d);
    });

    // 2. If viewing today, also overlay live telemetry from connected VPS nodes (ONLY IF activityDate matches targetDate!)
    if (targetDate === todayStr) {
      (servers || []).forEach(s => {
        const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
        const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
        if (tData && Array.isArray(tData.dailyUserActivity)) {
          tData.dailyUserActivity.forEach(d => {
            if (d && d.activityDate === targetDate) {
              registerDaily(s, d);
            }
          });
        }
      });

      Object.keys(telemetryData || {}).forEach(tKey => {
        const tData = telemetryData[tKey];
        if (tData && Array.isArray(tData.dailyUserActivity) && tData.dailyUserActivity.length > 0) {
          const matchedServer = (servers || []).find(s => s.id === tKey || s.ipPort === tKey || s.name === tKey || (s.ipPort && s.ipPort.split(':')[0] === tKey));
          tData.dailyUserActivity.forEach(d => {
            if (d && d.activityDate === targetDate) {
              registerDaily(matchedServer, d);
            }
          });
        }
      });
    }

    return map;
  }, [servers, telemetryData, historicalDailyRecords, targetDate, todayStr]);

// Robust parser to extract exact timestamp milliseconds from any date or time string (e.g. "06:32 PM", ISO, RFC)
function parseLogonTimeToMs(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return null;
  const clean = rawStr.replace(/^(Since|Today|Live RDP Session|●|\s)+/i, '').trim();
  if (!clean) return null;

  // 1. Try standard ISO or RFC date
  const standardMs = new Date(clean).getTime();
  if (!isNaN(standardMs) && clean.length >= 10 && (clean.includes('-') || clean.includes('/'))) {
    return standardMs;
  }

  // 2. Parse 12-hour or 24-hour time string like "06:32 PM", "6:32:15 PM", "18:32"
  const timeMatch = clean.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds);
    return d.getTime();
  }

  return null;
}

  // Aggregate comprehensive activity status for every registered client + telemetry users
  const comprehensiveUserActivityList = useMemo(() => {
    const combinedUsersMap = new Map();

    const resolveServerForUser = (srvRef) => {
      if (!srvRef) return null;
      const clean = String(srvRef).trim();
      return servers.find(sv => 
        sv.id === clean || 
        sv.ipPort === clean || 
        sv.name === clean || 
        (sv.ipPort && clean.includes(':') && sv.ipPort.split(':')[0] === clean.split(':')[0]) ||
        (sv.ipPort && sv.ipPort.split(':')[0] === clean)
      ) || null;
    };

    // 1. Map registered client subscription accounts
    users.forEach(u => {
      const username = (u.username || u.clientName || '').trim();
      if (!username || !isValidWindowsUsername(username)) return;
      const lower = username.toLowerCase();
      const srv = resolveServerForUser(u.serverId || u.serverIp || u.vpsIp || u.serverName);
      
      const serverIdVal = srv ? srv.id : (u.serverId || 'N/A');
      const serverIpVal = srv ? (srv.ipPort || srv.name) : (u.vpsIp || u.serverIp || 'N/A');
      const serverNameVal = srv ? srv.name : (u.serverName || 'VPS Server');

      // Unique identity of this card: serverId/IP + username
      const cardServerKey = (srv ? srv.id : (u.serverId || u.serverIp || 'vps')).toLowerCase().trim();
      const uniqueUserKey = `${cardServerKey}::${lower}`;

      const userEntry = {
        id: u.id || `usr-${cardServerKey}-${lower}`,
        username,
        company: u.company || u.clientName || username,
        serverId: serverIdVal,
        serverName: serverNameVal,
        serverIp: serverIpVal,
        lastActiveAt: u.lastActiveAt || null,
        registrationDate: u.registrationDate || u.createdAt || null,
        isRegistered: true,
        userObj: u
      };

      combinedUsersMap.set(uniqueUserKey, userEntry);
    });

    // 2. Include physical local server users detected in telemetry ONLY IF not already registered for THIS server
    servers.forEach(s => {
      const srvIdKey = (s.id || s.ipPort).toLowerCase().trim();
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      if (tData && Array.isArray(tData.allServerUsers)) {
        tData.allServerUsers.forEach(rawName => {
          if (!rawName || typeof rawName !== 'string') return;
          const cleanName = rawName.trim();
          if (!isValidWindowsUsername(cleanName)) return;
          const lower = cleanName.toLowerCase();
          const uniqueUserKey = `${srvIdKey}::${lower}`;

          if (['newds', 'kkjhjmhgvhb', 'juist chill', 'mann', 'administrator', 'guest', 'defaultaccount', 'wdagutilityaccount'].includes(lower)) return;

          const tInact = Array.isArray(tData.inactivityTracker) ? tData.inactivityTracker.find(t => (t.username || '').toLowerCase() === lower) : null;
          const tDaily = Array.isArray(tData.dailyUserActivity) ? tData.dailyUserActivity.find(d => (d.username || '').toLowerCase() === lower) : null;
          const foundLastActive = tInact?.lastActiveAt || (tDaily?.activityDate ? `${tDaily.activityDate}T12:00:00Z` : null);

          if (!combinedUsersMap.has(uniqueUserKey)) {
            const localEntry = {
              id: `usr-raw-${srvIdKey}-${lower}`,
              username: cleanName,
              company: cleanName,
              serverId: s.id,
              serverName: s.name || s.ipPort,
              serverIp: s.ipPort || s.name,
              lastActiveAt: foundLastActive,
              registrationDate: null,
              isRegistered: false,
              userObj: { username: cleanName, serverId: s.id, ipPort: s.ipPort, lastActiveAt: foundLastActive }
            };
            combinedUsersMap.set(uniqueUserKey, localEntry);
          }
        });
      }
    });

    return Array.from(combinedUsersMap.values()).map(item => {
      const lower = item.username.toLowerCase();
      
      // Look up active session ONLY for this item's specific server aliases!
      const aliasesToTry = new Set();
      if (item.serverId && item.serverId !== 'N/A') aliasesToTry.add(String(item.serverId).toLowerCase().trim());
      if (item.serverIp && item.serverIp !== 'N/A') {
        aliasesToTry.add(String(item.serverIp).toLowerCase().trim());
        aliasesToTry.add(String(item.serverIp).split(':')[0].toLowerCase().trim());
      }
      if (item.serverName) aliasesToTry.add(String(item.serverName).toLowerCase().trim());

      let activeSessionInfo = null;
      let detailedSess = null;
      let dailyRecord = null;

      for (const alias of aliasesToTry) {
        const testKey = `${alias}::${lower}`;
        if (!activeSessionInfo && activeSessionsMap.has(testKey)) {
          activeSessionInfo = activeSessionsMap.get(testKey);
        }
        if (!detailedSess && detailedSessionMap.has(testKey)) {
          detailedSess = detailedSessionMap.get(testKey);
        }
        if (!dailyRecord && dailyActivityRecordsMap.has(testKey)) {
          dailyRecord = dailyActivityRecordsMap.get(testKey);
        }
      }

      // Resolve the true verified last login date across all historical database logs & user profiles
      let latestLoginDate = null;
      for (const alias of aliasesToTry) {
        const testKey = `${alias}::${lower}`;
        if (!latestLoginDate && userLastActiveMap && userLastActiveMap[testKey]) {
          latestLoginDate = userLastActiveMap[testKey];
        }
      }

      if (!latestLoginDate && (item.lastActiveAt || item.userObj?.lastActiveAt)) {
        latestLoginDate = String(item.lastActiveAt || item.userObj?.lastActiveAt).substring(0, 10);
      }

      const isViewingToday = (targetDate === todayStr);
      const isCurrentlyOnline = isViewingToday && Boolean(activeSessionInfo);

      let lastActiveDateStr = 'Never';
      let exactLogonTimestamp = isViewingToday ? 'Not Logged In Today' : `Not Logged In on ${targetDate}`;
      let timeIntervalStr = isViewingToday ? 'Not Logged In Today' : `Not Logged In on ${targetDate}`;
      let sessionDurationStr = '0 mins';
      let daysInactive = 0;
      let loggedInToday = false;

      // Format clean human-readable logon timestamp
      const formatTimeClean = (rawTime) => {
        if (!rawTime || rawTime === 'Live RDP Session' || rawTime === 'Today') return 'Live Session';
        if (typeof rawTime === 'string' && (rawTime.includes('AM') || rawTime.includes('PM'))) return rawTime;
        const d = new Date(rawTime);
        if (isNaN(d.getTime())) return rawTime;
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      };

      const rawLogonCandidate = detailedSess?.logonTime || activeSessionInfo?.logonTime;

      const hasGenuineDailyRecord = Boolean(
        dailyRecord && 
        (
          (dailyRecord.firstLogin && dailyRecord.firstLogin !== 'N/A' && dailyRecord.firstLogin !== 'null' && dailyRecord.firstLogin !== '') ||
          (parseInt(dailyRecord.totalUsageSeconds) > 0) ||
          (parseInt(dailyRecord.sessionCount) > 0)
        )
      );

      if (isViewingToday) {
        // A user is ONLY logged in today if there is a LIVE active session right now, OR a confirmed daily activity record from today!
        if (isCurrentlyOnline) {
          loggedInToday = true;
          daysInactive = 0;
          lastActiveDateStr = 'Today (Online Now)';
          const cleanLogon = formatTimeClean(rawLogonCandidate || dailyRecord?.firstLogin);
          exactLogonTimestamp = cleanLogon;
          timeIntervalStr = `Since ${cleanLogon}`;

          // REAL-TIME LIVE DURATION STOPWATCH
          let liveDurationSeconds = 0;
          const logonStartMs = parseLogonTimeToMs(rawLogonCandidate || dailyRecord?.firstLogin);
          if (logonStartMs && !isNaN(logonStartMs)) {
            liveDurationSeconds = Math.max(0, Math.floor((liveClockMs - logonStartMs) / 1000));
          }
          const hrs = Math.floor(liveDurationSeconds / 3600);
          const mins = Math.floor((liveDurationSeconds % 3600) / 60);
          const secs = liveDurationSeconds % 60;
          const timerStr = hrs > 0 ? `${hrs}h ${mins}m ${secs < 10 ? '0' : ''}${secs}s` : `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
          sessionDurationStr = `Live ${timerStr}`;
        } else if (hasGenuineDailyRecord) {
          // User logged in today and has since logged out!
          loggedInToday = true;
          daysInactive = 0;
          lastActiveDateStr = 'Today (Logged Out)';
          const cleanLogin = formatTimeClean(dailyRecord.firstLogin);
          const cleanLogout = dailyRecord.lastLogout && dailyRecord.lastLogout !== 'N/A' ? formatTimeClean(dailyRecord.lastLogout) : 'Completed';
          exactLogonTimestamp = cleanLogin;
          timeIntervalStr = `${cleanLogin} - ${cleanLogout}`;

          const usageSec = parseInt(dailyRecord.totalUsageSeconds) || 0;
          const hours = Math.floor(usageSec / 3600);
          const mins = Math.floor((usageSec % 3600) / 60);
          sessionDurationStr = hours > 0 ? `${hours}h ${mins}m` : (mins > 0 ? `${mins}m` : (usageSec > 0 ? `${usageSec}s` : 'Completed'));
        } else {
          // NOT LOGGED IN TODAY (Calculate exact inactivity relative to targetDate)
          loggedInToday = false;
          exactLogonTimestamp = 'Not Logged In Today';
          timeIntervalStr = 'No Activity Today';
          sessionDurationStr = '0 mins';

          if (latestLoginDate) {
            const diffMs = new Date(targetDate).getTime() - new Date(latestLoginDate).getTime();
            daysInactive = Math.max(0, Math.floor(diffMs / 86400000));
            if (daysInactive === 0) {
              lastActiveDateStr = 'Today';
            } else if (daysInactive === 1) {
              lastActiveDateStr = 'Yesterday (Logged Out)';
            } else if (daysInactive < 7) {
              lastActiveDateStr = `${daysInactive} days ago (${latestLoginDate})`;
            } else {
              lastActiveDateStr = `${daysInactive} days ago (${latestLoginDate})`;
            }
          } else {
            daysInactive = 7;
            lastActiveDateStr = 'Never Logged In (7+ Days Inactive)';
          }
        }
      } else {
        // VIEWING HISTORICAL DATE (e.g. Yesterday, 09/01/2026, etc.)
        if (hasGenuineDailyRecord) {
          loggedInToday = true;
          daysInactive = 0;
          lastActiveDateStr = `${targetDate} (Logged Out)`;
          const cleanLogin = formatTimeClean(dailyRecord.firstLogin);
          const cleanLogout = dailyRecord.lastLogout && dailyRecord.lastLogout !== 'N/A' ? formatTimeClean(dailyRecord.lastLogout) : 'Completed';
          exactLogonTimestamp = cleanLogin;
          timeIntervalStr = `${cleanLogin} - ${cleanLogout}`;

          const usageSec = parseInt(dailyRecord.totalUsageSeconds) || 0;
          const hours = Math.floor(usageSec / 3600);
          const mins = Math.floor((usageSec % 3600) / 60);
          sessionDurationStr = hours > 0 ? `${hours}h ${mins}m` : (mins > 0 ? `${mins}m` : (usageSec > 0 ? `${usageSec}s` : 'Completed'));
        } else {
          loggedInToday = false;
          exactLogonTimestamp = `Did Not Log In on ${targetDate}`;
          timeIntervalStr = 'No Activity';
          sessionDurationStr = '0 mins';
          lastActiveDateStr = `No Login on ${targetDate}`;

          if (latestLoginDate) {
            const diffMs = new Date(targetDate).getTime() - new Date(latestLoginDate).getTime();
            daysInactive = Math.max(0, Math.floor(diffMs / 86400000));
            if (daysInactive === 0) {
              lastActiveDateStr = `${targetDate} (Active on other session)`;
            } else if (daysInactive === 1) {
              lastActiveDateStr = `1 day ago (${latestLoginDate})`;
            } else if (daysInactive < 7) {
              lastActiveDateStr = `${daysInactive} days ago (${latestLoginDate})`;
            } else {
              lastActiveDateStr = `${daysInactive} days ago (${latestLoginDate})`;
            }
          } else {
            daysInactive = 7;
            lastActiveDateStr = `No Login Record (7+ Days Inactive)`;
          }
        }
      }

      // If user logged in on this target date, daysInactive is ALWAYS 0 and isInactive7Days is ALWAYS false!
      if (loggedInToday || isCurrentlyOnline) {
        daysInactive = 0;
      }

      const isInactive7Days = (daysInactive >= 7) && !isCurrentlyOnline && !loggedInToday;

      let activityCategory = 'NOT_LOGGED_IN_TODAY';
      if (isCurrentlyOnline || loggedInToday) {
        activityCategory = 'TODAY_LOGGED_IN';
      } else if (isInactive7Days) {
        activityCategory = 'INACTIVE_7_DAYS';
      }

      return {
        ...item,
        // Immutable server ownership: NEVER overwritten!
        serverId: item.serverId,
        serverIp: item.serverIp,
        serverName: item.serverName,
        isCurrentlyOnline,
        loggedInToday,
        daysInactive,
        isInactive7Days,
        lastActiveDateStr,
        exactLogonTimestamp,
        timeIntervalStr,
        sessionDurationStr,
        activityCategory
      };
    });
  }, [users, servers, telemetryData, activeSessionsMap, detailedSessionMap, dailyActivityRecordsMap, userLastActiveMap, targetDate, todayStr, liveClockMs]);

  // Aggregate KPI Stats & Ratios
  const kpiStats = useMemo(() => {
    const totalAccounts = comprehensiveUserActivityList.length;
    const todayLoggedInCount = comprehensiveUserActivityList.filter(u => u.loggedInToday || u.isCurrentlyOnline).length;
    const notLoggedInTodayCount = comprehensiveUserActivityList.filter(u => !u.loggedInToday && !u.isCurrentlyOnline).length;
    const inactive7DaysCount = comprehensiveUserActivityList.filter(u => u.isInactive7Days).length;
    const activePendingCount = Math.max(0, notLoggedInTodayCount - inactive7DaysCount);

    const loggedInPercent = totalAccounts > 0 ? Math.round((todayLoggedInCount / totalAccounts) * 100) : 0;
    const inactivePercent = totalAccounts > 0 ? Math.round((inactive7DaysCount / totalAccounts) * 100) : 0;
    const activePendingPercent = Math.max(0, 100 - loggedInPercent - inactivePercent);

    return {
      totalAccounts,
      todayLoggedInCount,
      notLoggedInTodayCount,
      inactive7DaysCount,
      activePendingCount,
      loggedInPercent,
      notLoggedInPercent: activePendingPercent,
      inactivePercent
    };
  }, [comprehensiveUserActivityList]);

  // Filtered Activity Records
  const filteredRecords = useMemo(() => {
    return comprehensiveUserActivityList.filter(item => {
      // 1. Server Filter
      if (selectedServerFilter !== 'ALL') {
        if (item.serverId !== selectedServerFilter && item.serverIp !== selectedServerFilter && item.serverName !== selectedServerFilter) {
          return false;
        }
      }

      // 2. Activity Tab Filter
      if (activityTabMode === 'TODAY_LOGGED_IN') {
        if (!item.loggedInToday && !item.isCurrentlyOnline) return false;
      } else if (activityTabMode === 'NOT_LOGGED_IN_TODAY') {
        if (item.loggedInToday || item.isCurrentlyOnline) return false;
      } else if (activityTabMode === 'INACTIVE_7_DAYS') {
        if (!item.isInactive7Days) return false;
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchUser = item.username.toLowerCase().includes(q);
        const matchComp = item.company.toLowerCase().includes(q);
        const matchServer = item.serverName.toLowerCase().includes(q) || item.serverIp.toLowerCase().includes(q);
        if (!matchUser && !matchComp && !matchServer) return false;
      }

      return true;
    });
  }, [comprehensiveUserActivityList, selectedServerFilter, activityTabMode, searchQuery]);

  return (
    <div className="daily-activity-view" style={{ display: 'flex', flexDirection: 'column', gap: '22px', backgroundColor: '#070913', padding: '10px 4px' }}>
      {/* 1. EXECUTIVE COMMAND DECK HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 16px #10b981' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#f8fafc', margin: 0, letterSpacing: '-0.025em' }}>
              Daily User Activity &amp; Session Intelligence
            </h2>
            <span style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '20px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: '700', letterSpacing: '0.05em' }}>
              LIVE TELEMETRY
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, marginTop: '5px', fontWeight: '500' }}>
            Real-time RDP logon timestamps, active session durations, and dynamic pending users across VPS server nodes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Target Date Picker & Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(15, 23, 42, 0.8)', padding: '6px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)', height: '40px' }}>
              <Calendar size={15} color="#38bdf8" />
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '13px',
                  fontWeight: '600',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Quick Presets */}
            <button
              onClick={() => setTargetDate(todayStr)}
              style={{
                fontSize: '11px',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '8px',
                backgroundColor: targetDate === todayStr ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                color: targetDate === todayStr ? '#38bdf8' : '#94a3b8',
                border: targetDate === todayStr ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer'
              }}
            >
              Today
            </button>
          </div>

          {/* Export to Excel Button */}
          <button
            onClick={() => {
              const serverObj = servers.find(s => s.id === selectedServerFilter);
              const scopeName = serverObj ? `${serverObj.name} (${serverObj.ipPort})` : 'All VPS Servers';
              exportDailyUserActivityExcel(filteredRecords, targetDate, scopeName);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '0 18px',
              height: '40px',
              borderRadius: '10px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
              transition: 'all 0.2s'
            }}
            title="Download Excel / CSV Report for selected date and server filters"
          >
            <FileSpreadsheet size={16} />
            Export to Excel
          </button>

          {onRefreshTelemetry && (
            <button
              onClick={onRefreshTelemetry}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(30, 41, 59, 0.8)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                padding: '0 16px',
                height: '40px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={14} color="#38bdf8" />
              Sync Sessions
            </button>
          )}

          {/* VIEW SWITCHER */}
          <div style={{ display: 'flex', backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: '3px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)', height: '40px' }}>
            <button
              onClick={() => setViewStyle('GRID')}
              style={{
                padding: '0 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewStyle === 'GRID' ? '#2563eb' : 'transparent',
                color: viewStyle === 'GRID' ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '700',
                transition: 'all 0.2s'
              }}
            >
              <LayoutGrid size={14} />
              Grid
            </button>
            <button
              onClick={() => setViewStyle('TABLE')}
              style={{
                padding: '0 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewStyle === 'TABLE' ? '#2563eb' : 'transparent',
                color: viewStyle === 'TABLE' ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '700',
                transition: 'all 0.2s'
              }}
            >
              <List size={14} />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* 2. FLEET ACTIVITY DISTRIBUTION PROGRESS BAR */}
      <div style={{ padding: '16px 20px', borderRadius: '14px', backgroundColor: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: '700' }}>
          <span style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={15} color="#10b981" />
            Fleet Daily Activity Ratio ({kpiStats.totalAccounts} Total Monitored Accounts)
          </span>

          <div style={{ display: 'flex', gap: '18px', fontSize: '11.5px', fontWeight: '700' }}>
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              Logged In: {kpiStats.todayLoggedInCount} ({kpiStats.loggedInPercent}%)
            </span>
            <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              Recent Pending (1-6d): {kpiStats.activePendingCount} ({kpiStats.notLoggedInPercent}%)
            </span>
            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
              7+ Days Inactive: {kpiStats.inactive7DaysCount} ({kpiStats.inactivePercent}%)
            </span>
          </div>
        </div>

        {/* MULTI-SEGMENT PROGRESS BAR */}
        <div style={{ height: '10px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${kpiStats.loggedInPercent}%`, backgroundColor: '#10b981', boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)', transition: 'width 0.4s' }} title={`Logged In on Date: ${kpiStats.todayLoggedInCount}`} />
          <div style={{ width: `${kpiStats.notLoggedInPercent}%`, backgroundColor: '#f59e0b', boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)', transition: 'width 0.4s' }} title={`Recent Active Pending (1-6d): ${kpiStats.activePendingCount}`} />
          <div style={{ width: `${kpiStats.inactivePercent}%`, backgroundColor: '#ef4444', boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)', transition: 'width 0.4s' }} title={`Inactive 7+ Days: ${kpiStats.inactive7DaysCount}`} />
        </div>
      </div>

      {/* 3. HIGH-CONTRAST EXECUTIVE KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {/* LOGGED IN TODAY */}
        <div
          onClick={() => setActivityTabMode('TODAY_LOGGED_IN')}
          style={{
            padding: '20px',
            borderRadius: '16px',
            cursor: 'pointer',
            border: activityTabMode === 'TODAY_LOGGED_IN' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: activityTabMode === 'TODAY_LOGGED_IN' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.75)',
            boxShadow: activityTabMode === 'TODAY_LOGGED_IN' ? '0 0 24px rgba(16, 185, 129, 0.2)' : 'none',
            backdropFilter: 'blur(16px)',
            transition: 'all 0.25s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {targetDate === todayStr ? 'Logged In Today' : `Logged In (${targetDate})`}
            </div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#10b981', marginTop: '2px' }}>
              {kpiStats.todayLoggedInCount} <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>({kpiStats.loggedInPercent}%)</span>
            </div>
          </div>
        </div>

        {/* NOT LOGGED IN TODAY */}
        <div
          onClick={() => setActivityTabMode('NOT_LOGGED_IN_TODAY')}
          style={{
            padding: '20px',
            borderRadius: '16px',
            cursor: 'pointer',
            border: activityTabMode === 'NOT_LOGGED_IN_TODAY' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: activityTabMode === 'NOT_LOGGED_IN_TODAY' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.75)',
            boxShadow: activityTabMode === 'NOT_LOGGED_IN_TODAY' ? '0 0 24px rgba(245, 158, 11, 0.2)' : 'none',
            backdropFilter: 'blur(16px)',
            transition: 'all 0.25s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
            <Hourglass size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {targetDate === todayStr ? 'Not Logged In Today' : `Not Logged In (${targetDate})`}
            </div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#f59e0b', marginTop: '2px' }}>
              {kpiStats.notLoggedInTodayCount} <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>Pending</span>
            </div>
          </div>
        </div>

        {/* INACTIVE 7+ DAYS */}
        <div
          onClick={() => setActivityTabMode('INACTIVE_7_DAYS')}
          style={{
            padding: '20px',
            borderRadius: '16px',
            cursor: 'pointer',
            border: activityTabMode === 'INACTIVE_7_DAYS' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: activityTabMode === 'INACTIVE_7_DAYS' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(15, 23, 42, 0.75)',
            boxShadow: activityTabMode === 'INACTIVE_7_DAYS' ? '0 0 24px rgba(239, 68, 68, 0.2)' : 'none',
            backdropFilter: 'blur(16px)',
            transition: 'all 0.25s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inactive 7+ Days</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#ef4444', marginTop: '2px' }}>
              {kpiStats.inactive7DaysCount} <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>Dormant</span>
            </div>
          </div>
        </div>

        {/* TOTAL FLEET */}
        <div
          onClick={() => setActivityTabMode('ALL')}
          style={{
            padding: '20px',
            borderRadius: '16px',
            cursor: 'pointer',
            border: activityTabMode === 'ALL' ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: activityTabMode === 'ALL' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(15, 23, 42, 0.75)',
            boxShadow: activityTabMode === 'ALL' ? '0 0 24px rgba(168, 85, 247, 0.2)' : 'none',
            backdropFilter: 'blur(16px)',
            transition: 'all 0.25s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
            <Radio size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Monitored Fleet</div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#a855f7', marginTop: '2px' }}>
              {kpiStats.totalAccounts} <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>Accounts</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. SEGMENTED CONTROL & SEARCH BAR */}
      <div style={{ padding: '16px 20px', borderRadius: '14px', backgroundColor: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search by Username, Company Name, or Server Node IP..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '10px 14px 10px 40px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              transition: 'all 0.2s'
            }}
          />
        </div>

        {/* Server Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Server size={15} color="#94a3b8" />
          <select
            value={selectedServerFilter}
            onChange={e => setSelectedServerFilter(e.target.value)}
            style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '8px 14px',
              color: '#f8fafc',
              fontSize: '12.5px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="ALL" style={{ backgroundColor: '#0f172a' }}>🌐 All VPS Servers ({servers.length})</option>
            {servers.map(s => (
              <option key={s.id} value={s.id} style={{ backgroundColor: '#0f172a' }}>{s.name} ({s.ipPort})</option>
            ))}
          </select>
        </div>

        {/* Segmented Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActivityTabMode('TODAY_LOGGED_IN')}
            style={{
              padding: '7px 16px',
              borderRadius: '20px',
              border: activityTabMode === 'TODAY_LOGGED_IN' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
              backgroundColor: activityTabMode === 'TODAY_LOGGED_IN' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: activityTabMode === 'TODAY_LOGGED_IN' ? '#ffffff' : '#10b981',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🟢 Logged In {targetDate === todayStr ? 'Today' : ''} ({kpiStats.todayLoggedInCount})
          </button>

          <button
            onClick={() => setActivityTabMode('NOT_LOGGED_IN_TODAY')}
            style={{
              padding: '7px 16px',
              borderRadius: '20px',
              border: activityTabMode === 'NOT_LOGGED_IN_TODAY' ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
              backgroundColor: activityTabMode === 'NOT_LOGGED_IN_TODAY' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: activityTabMode === 'NOT_LOGGED_IN_TODAY' ? '#ffffff' : '#f59e0b',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ⏳ Not Logged In {targetDate === todayStr ? 'Today' : ''} ({kpiStats.notLoggedInTodayCount})
          </button>

          <button
            onClick={() => setActivityTabMode('INACTIVE_7_DAYS')}
            style={{
              padding: '7px 16px',
              borderRadius: '20px',
              border: activityTabMode === 'INACTIVE_7_DAYS' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
              backgroundColor: activityTabMode === 'INACTIVE_7_DAYS' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: activityTabMode === 'INACTIVE_7_DAYS' ? '#ffffff' : '#ef4444',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🚨 Inactive 7+ Days ({kpiStats.inactive7DaysCount})
          </button>

          <button
            onClick={() => setActivityTabMode('ALL')}
            style={{
              padding: '7px 16px',
              borderRadius: '20px',
              border: activityTabMode === 'ALL' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
              backgroundColor: activityTabMode === 'ALL' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              color: activityTabMode === 'ALL' ? '#ffffff' : '#38bdf8',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🌐 All Accounts ({kpiStats.totalAccounts})
          </button>
        </div>
      </div>

      {/* 5. MAIN DATA VIEW (GRID OR TABLE) */}
      {viewStyle === 'GRID' ? (
        /* ULTRA-PREMIUM BENTO CARD GRID MODE */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '18px' }}>
          {filteredRecords.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlignment: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Users size={40} color="#64748b" />
              <div style={{ fontSize: '15px', color: '#94a3b8', fontWeight: '600' }}>No user activity records match the selected filter criteria.</div>
            </div>
          ) : (
            filteredRecords.map(rec => {
              const firstChar = rec.username ? rec.username.charAt(0).toUpperCase() : 'U';
              const avatarBg = getAvatarGradient(rec.username);

              return (
                <div
                  key={rec.id}
                  style={{
                    borderRadius: '16px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: rec.isCurrentlyOnline ? '1px solid rgba(16, 185, 129, 0.5)' : (rec.loggedInToday ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'),
                    boxShadow: rec.isCurrentlyOnline ? '0 0 20px rgba(16, 185, 129, 0.15)' : '0 4px 20px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(16px)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    transition: 'all 0.25s ease-in-out'
                  }}
                >
                  {/* CARD HEADER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          background: avatarBg,
                          color: '#ffffff',
                          fontWeight: '900',
                          fontSize: '17px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.2)'
                        }}
                      >
                        {firstChar}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.01em' }}>
                            {rec.username}
                          </h4>
                          {copiedUser === rec.username ? (
                            <Check size={13} color="#10b981" />
                          ) : (
                            <Copy
                              size={12}
                              color="#64748b"
                              style={{ cursor: 'pointer', opacity: 0.8 }}
                              onClick={() => handleCopyUser(rec.username)}
                              title="Copy Username"
                            />
                          )}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px', fontWeight: '500' }}>
                          {rec.company}
                        </div>
                      </div>
                    </div>

                    <div>
                      {rec.isCurrentlyOnline ? (
                        <span style={{ fontSize: '10.5px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ● Online
                        </span>
                      ) : rec.loggedInToday ? (
                        <span style={{ fontSize: '10.5px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {targetDate === todayStr ? '✓ Today' : `✓ ${targetDate}`}
                        </span>
                      ) : rec.isInactive7Days ? (
                        <span style={{ fontSize: '10.5px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ⚠️ 7d Inactive
                        </span>
                      ) : (
                        <span style={{ fontSize: '10.5px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {targetDate === todayStr ? '⏳ Not Today' : '⏳ Not Logged In'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* METRIC CHIPS INSIDE CARD */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', backgroundColor: 'rgba(0, 0, 0, 0.35)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Server size={13} color="#38bdf8" /> VPS Node:
                      </span>
                      <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#38bdf8', fontSize: '12px', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                        {rec.serverIp}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={13} color="#a855f7" /> Total Duration:
                      </span>
                      <span style={{ fontWeight: '700', color: rec.isCurrentlyOnline ? '#10b981' : '#f8fafc', fontSize: '12px' }}>
                        {rec.sessionDurationStr}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={13} color="#64748b" /> Last Active:
                      </span>
                      <span style={{ fontWeight: '600', color: rec.loggedInToday ? '#10b981' : (rec.isInactive7Days ? '#ef4444' : '#94a3b8'), fontSize: '11.5px' }}>
                        {rec.lastActiveDateStr}
                      </span>
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                    <button
                      onClick={() => handleOpenUserHistory(rec)}
                      style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: '#f8fafc',
                        fontSize: '12px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <History size={14} /> History
                    </button>

                    {onDirectRemoteConnect && (
                      <button
                        onClick={() => onDirectRemoteConnect(rec.serverId, rec.username)}
                        style={{
                          flex: 1,
                          padding: '9px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 10px rgba(37, 99, 235, 0.3)',
                          transition: 'all 0.2s'
                        }}
                      >
                        <ExternalLink size={14} /> Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ULTRA-PREMIUM DATA TABLE MODE */
        <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden', backdropFilter: 'blur(16px)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '14px 20px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User Details</th>
                  <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company</th>
                  <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VPS Node</th>
                  <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                  <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session Time</th>
                  <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</th>
                  <th style={{ padding: '14px 20px', fontSize: '11.5px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                      No user activity records match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(rec => {
                    const firstChar = rec.username ? rec.username.charAt(0).toUpperCase() : 'U';
                    const avatarBg = getAvatarGradient(rec.username);

                    return (
                      <tr key={rec.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background-color 0.2s' }}>
                        {/* USER AVATAR & NAME */}
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: avatarBg,
                                color: '#ffffff',
                                fontWeight: '800',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {firstChar}
                            </div>
                            <div>
                              <div style={{ fontWeight: '800', color: '#f8fafc', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {rec.username}
                                {copiedUser === rec.username ? (
                                  <Check size={13} color="#10b981" />
                                ) : (
                                  <Copy
                                    size={12}
                                    color="#64748b"
                                    style={{ cursor: 'pointer', opacity: 0.8 }}
                                    onClick={() => handleCopyUser(rec.username)}
                                  />
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {rec.isRegistered ? 'Subscription Account' : 'Server Local Account'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* COMPANY */}
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#f8fafc', fontWeight: '600' }}>
                          {rec.company}
                        </td>

                        {/* VPS NODE & IP */}
                        <td style={{ padding: '14px 16px' }}>
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#f8fafc' }}>{rec.serverName}</div>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              {rec.serverIp}
                            </span>
                          </div>
                        </td>

                        {/* STATUS */}
                        <td style={{ padding: '14px 16px' }}>
                          {rec.isCurrentlyOnline ? (
                            <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: '700' }}>
                              ● Live Online
                            </span>
                          ) : rec.loggedInToday ? (
                            <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: '700' }}>
                              {targetDate === todayStr ? '✓ Logged In Today' : `✓ Logged In (${targetDate})`}
                            </span>
                          ) : rec.isInactive7Days ? (
                            <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: '700' }}>
                              ⚠️ 7d Inactive
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: '700' }}>
                              {targetDate === todayStr ? '⏳ Not Today' : '⏳ Not Logged In'}
                            </span>
                          )}
                        </td>

                        {/* LOGON TIME / INTERVAL */}
                        <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: '600', color: rec.loggedInToday ? '#10b981' : '#94a3b8' }}>
                          {rec.isCurrentlyOnline ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Clock size={14} color="#10b981" />
                              <span>Since {rec.exactLogonTimestamp}</span>
                            </div>
                          ) : rec.loggedInToday ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Clock size={14} color="#38bdf8" />
                              <span>{rec.timeIntervalStr}</span>
                            </div>
                          ) : (
                            <span>{rec.lastActiveDateStr}</span>
                          )}
                        </td>

                        {/* ACTIVE DURATION */}
                        <td style={{ padding: '14px 16px' }}>
                          {rec.isCurrentlyOnline ? (
                            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '800', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
                              {rec.sessionDurationStr}
                            </span>
                          ) : rec.loggedInToday ? (
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8' }}>
                              {rec.sessionDurationStr}
                            </span>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                              {rec.daysInactive === 999 ? 'No Logged In Event' : `${rec.daysInactive} Days Inactive`}
                            </span>
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenUserHistory(rec)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38bdf8',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                              title="View all previous login history"
                            >
                              <History size={12} /> History
                            </button>

                            {onDirectRemoteConnect && (
                              <button
                                onClick={() => onDirectRemoteConnect(rec.serverId, rec.username)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  backgroundColor: 'rgba(37, 99, 235, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  fontSize: '11.5px',
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <ExternalLink size={12} /> Connect
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USER SESSION HISTORY & PREVIOUS LOGINS MODAL */}
      {selectedHistoryUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          backgroundColor: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '780px',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.15)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            {/* MODAL HEADER */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: getAvatarGradient(selectedHistoryUser.username),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: '900',
                  fontSize: '18px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                  {selectedHistoryUser.username ? selectedHistoryUser.username.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedHistoryUser.username}
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                      {selectedHistoryUser.serverIp}
                    </span>
                  </h3>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Session History &amp; Previous Logins on {selectedHistoryUser.serverName}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedHistoryUser(null)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {historyLoading ? (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <RefreshCw size={28} className="spin-icon" color="#38bdf8" />
                  <div>Loading user login history from audit records...</div>
                </div>
              ) : (
                <>
                  {/* METRIC OVERVIEW CARDS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: '600' }}>Current Status</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: selectedHistoryUser.isCurrentlyOnline ? '#34d399' : '#94a3b8', marginTop: '4px' }}>
                        {selectedHistoryUser.isCurrentlyOnline ? '🟢 Online Live Now' : '⚪ Offline / Logged Out'}
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: '600' }}>Active Days Recorded</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#38bdf8', marginTop: '4px' }}>
                        {userHistoryData.dailySummaries?.length || (selectedHistoryUser.loggedInToday ? 1 : 0)} Days
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: '600' }}>Total Audit Sessions</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#f59e0b', marginTop: '4px' }}>
                        {userHistoryData.events?.length || (selectedHistoryUser.loggedInToday ? 1 : 0)} Sessions
                      </div>
                    </div>
                  </div>

                  {/* DATE FILTER BAR */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    backgroundColor: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '12px 16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Calendar size={16} color="#38bdf8" />
                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#f8fafc' }}>Filter by Specific Date:</span>
                      <input
                        type="date"
                        value={historyDateFilter}
                        onChange={(e) => setHistoryDateFilter(e.target.value)}
                        style={{
                          backgroundColor: '#0f172a',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: '8px',
                          color: '#f8fafc',
                          padding: '6px 12px',
                          fontSize: '12.5px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => setHistoryDateFilter('')}
                        style={{
                          backgroundColor: !historyDateFilter ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: !historyDateFilter ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: !historyDateFilter ? '#38bdf8' : '#94a3b8',
                          padding: '5px 12px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        All Dates
                      </button>

                      <button
                        onClick={() => setHistoryDateFilter(todayStr)}
                        style={{
                          backgroundColor: historyDateFilter === todayStr ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: historyDateFilter === todayStr ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: historyDateFilter === todayStr ? '#10b981' : '#94a3b8',
                          padding: '5px 12px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Today
                      </button>
                    </div>
                  </div>

                  {/* SPECIFIC DATE MULTIPLE SESSIONS BREAKDOWN */}
                  {historyDateFilter && (
                    <div style={{
                      backgroundColor: 'rgba(56, 189, 248, 0.04)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      borderRadius: '12px',
                      padding: '16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Clock size={16} /> All Login Sessions on {historyDateFilter}
                        </div>
                        {(() => {
                          const dateSummary = (userHistoryData.dailySummaries || []).find(d => d.activityDate === historyDateFilter);
                          const rawEvents = (userHistoryData.events || []).filter(e => (e.eventTimestamp || e.loginTime || '').startsWith(historyDateFilter));
                          const dateEvents = rawEvents.filter(e => Boolean(e.logoutTime && parseInt(e.durationSeconds) > 0) || Boolean(e.eventState === 'LoggedIn' && !e.logoutTime));
                          const count = dateEvents.length || (dateSummary?.sessionCount) || (historyDateFilter === todayStr && selectedHistoryUser.loggedInToday ? 1 : 0);
                          const sec = parseInt(dateSummary?.totalUsageSeconds) || dateEvents.reduce((acc, curr) => acc + (parseInt(curr.durationSeconds) || 0), 0);
                          const h = Math.floor(sec / 3600);
                          const m = Math.floor((sec % 3600) / 60);
                          const totalStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                          return (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: '700' }}>
                                Total Logins: {count} {count === 1 ? 'time' : 'times'}
                              </span>
                              {sec > 0 && (
                                <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: '700' }}>
                                  Total Usage: {totalStr}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* SESSION INTERVAL ROWS */}
                      {(() => {
                        const rawEvents = (userHistoryData.events || []).filter(e => (e.eventTimestamp || e.loginTime || '').startsWith(historyDateFilter));
                        const dateEvents = rawEvents.filter(e => Boolean(e.logoutTime && parseInt(e.durationSeconds) > 0) || Boolean(e.eventState === 'LoggedIn' && !e.logoutTime));
                        if (dateEvents.length === 0) {
                          return (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                              {historyDateFilter === todayStr && selectedHistoryUser.loggedInToday ? (
                                <div style={{ color: '#38bdf8' }}>
                                  Logged in today at <strong>{selectedHistoryUser.exactLogonTimestamp}</strong> ({selectedHistoryUser.timeIntervalStr})
                                </div>
                              ) : (
                                `No session interval events recorded for ${historyDateFilter}.`
                              )}
                            </div>
                          );
                        }

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {dateEvents.map((evt, eIdx) => {
                              const isOut = evt.eventState === 'LoggedOut' || evt.logoutTime;
                              const durSec = parseInt(evt.durationSeconds) || 0;
                              const durH = Math.floor(durSec / 3600);
                              const durM = Math.floor((durSec % 3600) / 60);
                              const durS = durSec % 60;
                              const durFormatted = durH > 0 ? `${durH}h ${durM}m ${durS}s` : `${durM}m ${durS}s`;

                              const loginStr = evt.loginTime ? new Date(evt.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Earlier';
                              const logoutStr = evt.logoutTime ? new Date(evt.logoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (historyDateFilter === todayStr && selectedHistoryUser.isCurrentlyOnline ? '🟢 Live Active Now' : 'Completed');

                              return (
                                <div key={eIdx} style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '10px 14px',
                                  borderRadius: '10px',
                                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                  border: '1px solid rgba(255, 255, 255, 0.06)'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                      color: '#38bdf8',
                                      fontSize: '11px',
                                      fontWeight: '800',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      #{eIdx + 1}
                                    </span>
                                    <div>
                                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: '#10b981' }}>🟢 Login: {loginStr}</span>
                                        <span style={{ color: '#64748b' }}>➔</span>
                                        <span style={{ color: evt.logoutTime ? '#ef4444' : '#38bdf8' }}>
                                          {evt.logoutTime ? `🔴 Logout: ${logoutStr}` : logoutStr}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                        Session: {evt.sessionId || 'RDP'} | Recorded at: {evt.eventTimestamp ? new Date(evt.eventTimestamp).toLocaleTimeString() : 'Today'}
                                      </div>
                                    </div>
                                  </div>

                                  <div>
                                    {durSec > 0 ? (
                                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '4px 10px', borderRadius: '8px' }}>
                                        ⏱️ {durFormatted}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700' }}>
                                        🟢 Active Session
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* PREVIOUS LOGIN DATES & DAILY SUMMARY TABLE */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#cbd5e1', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CalendarClock size={15} color="#38bdf8" /> Daily Activity &amp; Total Usage Summaries
                    </div>

                    <div style={{ borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden', backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', textAlign: 'left' }}>
                            <th style={{ padding: '10px 14px', fontWeight: '700' }}>Activity Date</th>
                            <th style={{ padding: '10px 14px', fontWeight: '700' }}>First Login</th>
                            <th style={{ padding: '10px 14px', fontWeight: '700' }}>Last Active / Logout</th>
                            <th style={{ padding: '10px 14px', fontWeight: '700' }}>Total Daily Duration</th>
                            <th style={{ padding: '10px 14px', fontWeight: '700', textAlign: 'right' }}>Total Logins</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const rawList = userHistoryData.dailySummaries || [];
                            const displayedList = historyDateFilter ? rawList.filter(d => d.activityDate === historyDateFilter) : rawList;

                            if (displayedList.length === 0) {
                              return (
                                <tr>
                                  <td colSpan="5" style={{ textAlign: 'center', padding: '30px 14px', color: '#64748b' }}>
                                    {selectedHistoryUser.loggedInToday ? (
                                      <div>
                                        <div style={{ color: '#38bdf8', fontWeight: '700' }}>Today: Logged in at {selectedHistoryUser.exactLogonTimestamp}</div>
                                        <div style={{ fontSize: '11px', marginTop: '4px' }}>Earlier historical records will populate as sessions are recorded daily.</div>
                                      </div>
                                    ) : (
                                      `No daily summaries found${historyDateFilter ? ` for ${historyDateFilter}` : ''}.`
                                    )}
                                  </td>
                                </tr>
                              );
                            }

                            return displayedList.map((item, idx) => {
                              const usageSec = parseInt(item.totalUsageSeconds) || 0;
                              const hrs = Math.floor(usageSec / 3600);
                              const mins = Math.floor((usageSec % 3600) / 60);
                              const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', cursor: 'pointer' }} onClick={() => setHistoryDateFilter(item.activityDate)}>
                                  <td style={{ padding: '10px 14px', fontWeight: '700', color: '#f8fafc' }}>
                                    📅 {item.activityDate}
                                  </td>
                                  <td style={{ padding: '10px 14px', color: '#34d399', fontFamily: 'monospace' }}>
                                    {item.firstLogin || 'Earlier'}
                                  </td>
                                  <td style={{ padding: '10px 14px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                    {item.lastLogout || (item.activityDate === targetDate && selectedHistoryUser.isCurrentlyOnline ? '🟢 Live Active' : 'Completed')}
                                  </td>
                                  <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: '700' }}>
                                    {durationStr}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f59e0b', fontWeight: '800', fontFamily: 'monospace' }}>
                                    {item.sessionCount || 1} login(s)
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setSelectedHistoryUser(null)}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
