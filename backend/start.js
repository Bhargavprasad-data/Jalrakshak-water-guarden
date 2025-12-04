// Simple startup script to catch errors
require('dotenv').config();

console.log('Starting JalRakshak Backend...');
console.log('Environment check:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- DB_HOST:', process.env.DB_HOST || 'localhost');
console.log('- PORT:', process.env.PORT || 3000);

try {
  require('./src/server.js');
} catch (error) {
  console.error('Fatal error starting server:');
  console.error(error);
  process.exit(1);
}






