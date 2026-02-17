
#!/bin/bash

# --- Color Definitions ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Gemini Pulse Pro Deployment...${NC}"

# 1. Update and Install Nginx & Node.js
echo -e "${YELLOW}Step 1: Installing dependencies (Nginx, Node.js)...${NC}"
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nginx nodejs

# 2. Setup project directory
PROJECT_DIR="/var/www/gemini-pulse"
echo -e "${YELLOW}Step 2: Setting up project directory at $PROJECT_DIR...${NC}"
sudo mkdir -p "$PROJECT_DIR/dist"
sudo chown -R $USER:$USER "$PROJECT_DIR"

# 3. Install Server dependencies
echo -e "${YELLOW}Step 3: Installing Node.js packages...${NC}"
cd "$PROJECT_DIR"
if [ ! -f "package.json" ]; then
    npm init -y
fi
npm install express axios cors dotenv

# 4. Configuration - API KEY
if [ ! -f ".env" ]; then
    echo -e "${GREEN}Creating .env file...${NC}"
    echo "# Gemini API Key Configuration" > .env
    echo "API_KEY=YOUR_GEMINI_API_KEY_HERE" >> .env
    echo -e "${YELLOW}Created .env template. PLEASE EDIT THIS FILE LATER and replace YOUR_GEMINI_API_KEY_HERE with your real key.${NC}"
fi

# 5. Copy Nginx config (Assuming nginx.conf exists in current directory)
echo -e "${YELLOW}Step 4: Configuring Nginx...${NC}"
if [ -f "nginx.conf" ]; then
    sudo cp nginx.conf /etc/nginx/sites-available/gemini-pulse
    sudo ln -sf /etc/nginx/sites-available/gemini-pulse /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl restart nginx
else
    echo -e "${YELLOW}Warning: nginx.conf not found in current directory. Skipping Nginx automated setup.${NC}"
fi

# 6. Final Instructions
echo -e "${GREEN}--------------------------------------------------${NC}"
echo -e "${GREEN}Deployment Script Finished!${NC}"
echo -e "1. Edit ${YELLOW}$PROJECT_DIR/.env${NC} and add your Gemini API Key."
echo -e "2. Upload your ${YELLOW}dist/${NC} folder contents to ${YELLOW}$PROJECT_DIR/dist/${NC}"
echo -e "3. Start the server using: ${YELLOW}node server.js${NC} (inside $PROJECT_DIR)"
echo -e "   Or use PM2 for production: ${YELLOW}sudo npm install -g pm2 && pm2 start server.js --name pulse${NC}"
echo -e "${GREEN}--------------------------------------------------${NC}"
