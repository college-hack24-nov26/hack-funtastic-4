const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const adminDashboardController = require('../controllers/adminDashboardController');

const router = express.Router();

router.get('/dashboard', authenticate, requireAdmin, adminDashboardController.getDashboard);

module.exports = router;
