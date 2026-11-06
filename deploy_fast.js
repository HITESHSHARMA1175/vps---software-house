import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { buildAllProtectedScripts } from './scripts/build_encrypted_scripts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMOTE_TARGET_DIR = process.env.REMOTE_TARGET_DIR || '/var/www/vps.innovationwebworks.in';

console.log("🔒 Building encrypted & protected PowerShell scripts...");
buildAllProtectedScripts();

console.log("🔨 Running Vite build...");
execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });

console.log("📦 Packaging latest dist folder into dist.tar.gz...");
execSync('tar -czf dist.tar.gz -C dist .', { cwd: __dirname });

const conn = new Client();

console.log("🚀 Fast Deployment to vps.innovationwebworks.in starting...");

conn.on('ready', () => {
  console.log('✅ SSH Connected!');

  conn.sftp((err, sftp) => {
    if (err) throw err;

    const filesToUpload = [
      { local: path.join(__dirname, 'dist.tar.gz'), remote: `${REMOTE_TARGET_DIR}/dist.tar.gz` },
      { local: path.join(__dirname, 'server.js'), remote: `${REMOTE_TARGET_DIR}/server.js` },
      { local: path.join(__dirname, 'package.json'), remote: `${REMOTE_TARGET_DIR}/package.json` },
      { local: path.join(__dirname, 'schema.sql'), remote: `${REMOTE_TARGET_DIR}/schema.sql` },
      { local: path.join(__dirname, 'install.ps1'), remote: `${REMOTE_TARGET_DIR}/install.ps1` },
      { local: path.join(__dirname, 'VpsAgent.ps1'), remote: `${REMOTE_TARGET_DIR}/VpsAgent.ps1` },
      { local: path.join(__dirname, 'Install_VpsAgent_Service.bat'), remote: `${REMOTE_TARGET_DIR}/Install_VpsAgent_Service.bat` },
      { local: path.join(__dirname, 'Uninstall_VpsAgent_Service.bat'), remote: `${REMOTE_TARGET_DIR}/Uninstall_VpsAgent_Service.bat` },
      { local: path.join(__dirname, 'Check_VpsAgent_Status.bat'), remote: `${REMOTE_TARGET_DIR}/Check_VpsAgent_Status.bat` },
      { local: path.join(__dirname, 'Update_VpsAgent.bat'), remote: `${REMOTE_TARGET_DIR}/Update_VpsAgent.bat` },
      { local: path.join(__dirname, 'InnovationVpsAgent.exe'), remote: `${REMOTE_TARGET_DIR}/InnovationVpsAgent.exe` },
      { local: path.join(__dirname, 'VpsAgentService.cs'), remote: `${REMOTE_TARGET_DIR}/VpsAgentService.cs` },
      { local: path.join(__dirname, 'powershell-scripts', 'Create_Tally_User.ps1'), remote: `${REMOTE_TARGET_DIR}/Create_Tally_User.ps1` },
      { local: path.join(__dirname, 'public', 'api_proxy.php'), remote: `${REMOTE_TARGET_DIR}/api_proxy.php` }
    ];

    let pending = filesToUpload.length;

    filesToUpload.forEach(item => {
      console.log(`📦 Uploading ${path.basename(item.local)}...`);
      sftp.fastPut(item.local, item.remote, (err) => {
        if (err) console.error(`❌ Error uploading ${path.basename(item.local)}:`, err.message);
        else console.log(`  └── Uploaded: ${path.basename(item.local)}`);
        
        pending--;
        if (pending === 0) {
          console.log("📄 Creating Apache .htaccess & restarting backend via PM2...");
          runRemoteDeployment();
        }
      });
    });
  });
}).connect({
  host: process.env.SSH_HOST || '127.0.0.1',
  port: parseInt(process.env.SSH_PORT || '22', 10),
  username: process.env.SSH_USER || 'root',
  password: process.env.SSH_PASSWORD || '',
  readyTimeout: 30000
});

function runRemoteDeployment() {
  const htaccessContent = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Route /api, installer and agent scripts through PHP Proxy to Express Backend Port 5000
  RewriteRule ^(api|install\\.ps1|install\\.bat|install|VpsAgent\\.ps1|InnovationVpsAgent\\.exe|VpsAgentService\\.cs|Install_VpsAgent_Service\\.bat|Uninstall_VpsAgent_Service\\.bat|Check_VpsAgent_Status\\.bat|Update_VpsAgent\\.bat)(.*)$ api_proxy.php [L,QSA]

  # Disable browser caching for SPA HTML and JS bundles
  <IfModule mod_headers.c>
    Header set Cache-Control "no-cache, no-store, must-revalidate, max-age=0"
    Header set Pragma "no-cache"
    Header set Expires 0
  </IfModule>

  # SPA HTML5 History Routing
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
`;

  const remoteHtaccessPath = `${REMOTE_TARGET_DIR}/.htaccess`;
  
  conn.sftp((err, sftp) => {
    sftp.writeFile(remoteHtaccessPath, htaccessContent, (err) => {
      if (err) console.warn("Notice writing .htaccess:", err.message);
      else console.log("  └── .htaccess created!");

      const cmd = `
        export PATH="/var/www/a763f597-16ef-4a95-84d3-99f8e06114bf/.nvm/versions/node/v20.20.2/bin:$PATH"
        export NVM_DIR="/var/www/a763f597-16ef-4a95-84d3-99f8e06114bf/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
        cd "${REMOTE_TARGET_DIR}"
        echo "=== EXTRACTING DIST.TAR.GZ ==="
        tar -xzf dist.tar.gz
        rm -f dist.tar.gz
        echo "=== RESTARTING VPS BACKEND ==="
        pm2 stop vps-backend || true
        pm2 delete vps-backend || true
        fuser -k 5000/tcp 2>/dev/null || true
        sleep 1
        PORT=5000 pm2 start server.js --name vps-backend
        pm2 save
        sleep 3
        echo "=== PM2 STATUS ==="
        pm2 status
        echo "=== VERIFYING DETECT-SERVER ENDPOINT ==="
        curl -s http://127.0.0.1:5000/api/agent/detect-server
      `;

      conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let stdout = '';
        let stderr = '';
        stream.on('close', (code) => {
          console.log('\n🎉 FULL DEPLOYMENT COMPLETED SUCCESSFULLY WITH CODE ' + code);
          console.log('--- STDOUT ---');
          console.log(stdout);
          if (stderr) {
            console.log('--- STDERR ---');
            console.log(stderr);
          }
          conn.end();
          process.exit(0);
        }).on('data', (d) => { stdout += d; console.log(d.toString()); })
          .stderr.on('data', (d) => { stderr += d; console.error(d.toString()); });
      });
    });
  });
}
