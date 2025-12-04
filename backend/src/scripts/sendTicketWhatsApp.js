const ticketService = require('../services/ticketService');
const logger = require('../utils/logger');

async function sendTicketWhatsApp() {
  try {
    logger.info('Starting WhatsApp notification for all open tickets...');
    const result = await ticketService.sendWhatsAppForAllOpenTickets();
    
    logger.info('WhatsApp notification completed:', result);
    console.log('\n✅ WhatsApp Notifications Sent:');
    console.log(`   Processed: ${result.processed} tickets`);
    console.log(`   Messages Sent: ${result.sent}`);
    console.log(`   Total Contacts: ${result.totalContacts}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Error sending WhatsApp notifications:', error);
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  sendTicketWhatsApp();
}

module.exports = sendTicketWhatsApp;



