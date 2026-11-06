import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ SSH Connection Established! Installing NVM, Node.js v20, and PM2...');

  const cmd = `
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    export NVM_DIR="$HOME/.nvm" && \
    [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh" && \
    nvm install 20 && \
    nvm use 20 && \
    npm install -g pm2 && \
    node -v && npm -v && pm2 -v
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = '';
    let stderr = '';
    stream.on('close', (code, signal) => {
      console.log('Command exited with code ' + code);
      console.log('--- STDOUT ---');
      console.log(stdout);
      console.log('--- STDERR ---');
      console.log(stderr);
      conn.end();
    }).on('data', (data) => {
      stdout += data;
      console.log(data.toString());
    }).stderr.on('data', (data) => {
      stderr += data;
      console.error(data.toString());
    });
  });
}).connect({
  host: process.env.SSH_HOST || process.env.SSH_HOST || '127.0.0.1',
  port: parseInt(process.env.SSH_PORT || '22', 10),
  username: process.env.SSH_USER || process.env.SSH_USER || 'root',
  password: process.env.SSH_PASSWORD || '',
  readyTimeout: 60000
});
