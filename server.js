
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
// Load environment variables from .env file
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TASKS_FILE = path.join(__dirname, 'tasks.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Ensure tasks file exists
if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([]));
}

// Task API
app.get('/api/tasks', (req, res) => {
    try {
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        res.json(tasks);
    } catch (e) {
        res.json([]);
    }
});

app.post('/api/tasks', (req, res) => {
    try {
        fs.writeFileSync(TASKS_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to save tasks" });
    }
});

// Gemini Proxy - Handles the connection for restricted networks
app.post('/api/proxy-gemini', async (req, res) => {
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ error: "API_KEY is not configured on the server. Please check your .env file." });
    }

    const { model, contents, config } = req.body;
    
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            { contents, ...config },
            { headers: { 'Content-Type': 'application/json' } }
        );
        res.json(response.data);
    } catch (error) {
        const errorData = error.response?.data || { error: error.message };
        console.error('Gemini Proxy Error:', JSON.stringify(errorData));
        res.status(error.response?.status || 500).json(errorData);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!process.env.API_KEY) {
        console.warn('WARNING: API_KEY is missing in environment variables!');
    }
});
