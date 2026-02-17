
#!/bin/bash
echo "Starting Gemini Pulse Pro Deployment..."

# 1. Update and Install Nginx & Node.js
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nginx nodejs

# 2. Setup project directory
sudo mkdir -p /var/www/gemini-pulse/dist

# 3. Install Server dependencies
cd /var/www/gemini-pulse
npm init -y
npm install express axios cors

# 4. Copy Nginx config
sudo cp nginx.conf /etc/nginx/sites-available/gemini-pulse
sudo ln -s /etc/nginx/sites-available/gemini-pulse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 5. Restart Nginx
sudo nginx -t
sudo systemctl restart nginx

# 6. Start Server (Recommend using pm2 for production)
# sudo npm install -g pm2
# pm2 start server.js --name "gemini-pulse"

echo "Ready! Upload your 'dist' files to /var/www/gemini-pulse/dist and start server.js"
