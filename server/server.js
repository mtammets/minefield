const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets from the public directory.
app.use(express.static(path.join(__dirname, '../public')));

// Lightweight health check endpoint.
app.get('/api/ping', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Start the HTTP server.
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
