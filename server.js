const express = require('express');
const { Pool } = require('pg');
const dotenv = require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    user: process.env.DB_USER || 'polinasnihurska',
    host: 'localhost',
    database: 'myappdb',
    password: '',
    port: 5432,
  });

app.use(express.json());

app.get('/api/health', async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({
        status: 'ok',
        db_connected: true,
        db_time: result.rows[0].now
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        db_connected: false,
        message: err.message
      });
    }
  });

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});