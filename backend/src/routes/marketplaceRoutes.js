const express = require('express');
const router = express.Router();
const controller = require('../controllers/marketplaceController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalBuyer = require('../middleware/optionalBuyerMiddleware');
const { requireBuyer } = require('../middleware/roleMiddleware');

/**
 * Marketplace Routes (mounted at /api/marketplace)
 *
 * Every route requires a verified JWT. Farmer-side routes need only that, because
 * the farmer role is implicit for any real account. Buyer-side routes add
 * requireBuyer(), which also rejects suspended buyers.
 */

// --- farmer: what I have to sell ------------------------------------------
router.get('/farmer/availability/suggestions', authMiddleware, controller.getAvailabilitySuggestions);
router.get('/farmer/availability', authMiddleware, controller.listMyAvailability);
router.post('/farmer/availability', authMiddleware, controller.createAvailability);
router.patch('/farmer/availability/:id', authMiddleware,
  require('../controllers/marketplaceChatController').requireNumericId('id'),
  controller.updateAvailability);
// Soft-deletes: a listing referenced by an agreed deal keeps that history.
router.delete('/farmer/availability/:id', authMiddleware,
  require('../controllers/marketplaceChatController').requireNumericId('id'),
  controller.deleteAvailability);

// --- buyer: browse what farmers have for sale -----------------------------
// optionalBuyer, not requireBuyer: a farmer may look at the open market too.
// Declared before the '/farmer/*' group only for readability; the paths differ,
// so order does not affect matching here.
router.get('/availability', authMiddleware, optionalBuyer, controller.browseAvailability);

// --- farmer: discovery and comparison -------------------------------------
// Buyers looking for your crop
router.get('/farmer/matches', authMiddleware, controller.getFarmerMatches);
// Ranked by money in hand, not advertised price
router.get('/farmer/top-buyers', authMiddleware, controller.getTopBuyers);
// Mandis and direct buyers side by side
router.get('/selling-options', authMiddleware, controller.getSellingOptions);

// --- buyer dashboard ------------------------------------------------------
router.get('/buyer/summary', authMiddleware, requireBuyer(), controller.getBuyerSummary);

// ===========================================================================
// Chat, offers, deals, notifications
// ===========================================================================
const chat = require('../controllers/marketplaceChatController');
const { uploadAttachment } = require('../middleware/marketplaceUploadMiddleware');
// Guards every ':id' route so a malformed id 404s instead of reaching SQL as NaN.
const numericId = chat.requireNumericId('id');

// --- conversations --------------------------------------------------------
router.post('/conversations', authMiddleware, chat.createConversation);
router.get('/conversations', authMiddleware, chat.listConversations);
router.get('/conversations/:id/messages', authMiddleware, numericId, chat.getMessages);
// Accepts JSON text or a multipart photo under the field name "attachment".
router.post('/conversations/:id/messages', authMiddleware, numericId, uploadAttachment, chat.sendMessage);
router.post('/conversations/:id/read', authMiddleware, numericId, chat.markConversationRead);
router.post('/conversations/:id/block', authMiddleware, numericId, chat.blockConversation);

// The ONLY route to attachment bytes; participation is verified before streaming.
router.get('/messages/:id/attachment', authMiddleware, numericId, chat.getAttachment);

// --- offers ---------------------------------------------------------------
router.post('/offers', authMiddleware, chat.createOffer);
router.get('/offers', authMiddleware, chat.listOffers);
router.get('/offers/:id', authMiddleware, numericId, chat.getOffer);
router.post('/offers/:id/accept', authMiddleware, numericId, chat.acceptOffer);
router.post('/offers/:id/reject', authMiddleware, numericId, chat.rejectOffer);
router.post('/offers/:id/counter', authMiddleware, numericId, chat.counterOffer);
router.post('/offers/:id/withdraw', authMiddleware, numericId, chat.withdrawOffer);

// --- deals ----------------------------------------------------------------
router.get('/deals', authMiddleware, chat.listDeals);
router.get('/deals/:id', authMiddleware, numericId, chat.getDeal);
router.patch('/deals/:id/status', authMiddleware, numericId, chat.updateDealStatus);

// --- notifications --------------------------------------------------------
router.get('/notifications', authMiddleware, chat.listNotifications);
router.post('/notifications/read-all', authMiddleware, chat.markAllNotificationsRead);
router.post('/notifications/:id/read', authMiddleware, numericId, chat.markNotificationRead);

// --- reports --------------------------------------------------------------
router.post('/reports', authMiddleware, chat.createReport);

module.exports = router;
