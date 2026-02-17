
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

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
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE));
    res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

// Gemini Proxy - Handles the connection for restricted networks
app.post('/api/proxy-gemini', async (req, res) => {
    const apiKey = process.env.API_KEY;
    const { model, contents, config } = req.body;
    
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            { contents, ...config },
            { headers: { 'Content-Type': 'application/json' } }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Gemini Proxy Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'Internal Server Error' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
