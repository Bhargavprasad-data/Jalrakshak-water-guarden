// Script to create admin dashboard structures
// This will be run manually to set up the three admin dashboards

const fs = require('fs');
const path = require('path');

const dashboards = [
  { name: 'super-admin-dashboard', port: 3004, adminLevel: 'super_admin' },
  { name: 'district-admin-dashboard', port: 3003, adminLevel: 'district_admin' },
  { name: 'mandal-admin-dashboard', port: 3002, adminLevel: 'mandal_admin' }
];

console.log('Admin Dashboard Creation Script');
console.log('This script will create the dashboard structures.');
console.log('Please run this manually or use the individual setup commands.');



