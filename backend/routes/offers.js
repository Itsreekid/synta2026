// =====================================================
// OFFERS API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/offers
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    let userProfile = null;
    let purchasedOfferIds = [];

    if (userId) {
      const profileResult = await pool.query(
        `SELECT class, branch, balance FROM users WHERE id = $1`,
        [userId]
      );
      userProfile = profileResult.rows[0] || null;

      const payResult = await pool.query(
        `SELECT offer_id FROM payments WHERE user_id = $1`,
        [userId]
      );
      purchasedOfferIds = payResult.rows.map((p) => p.offer_id).filter(Boolean);
    }

    const offersResult = await pool.query(
      `SELECT o.*,
         COALESCE(
           json_agg(c.*) FILTER (WHERE c.id IS NOT NULL),
           '[]'
         ) AS courses
       FROM offers o
       LEFT JOIN offer_courses oc ON oc.offer_id = o.id
       LEFT JOIN courses c ON c.id = oc.course_id
       WHERE o.is_active = true
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );

    let offers = offersResult.rows;

    if (userProfile) {
      offers = offers.filter((offer) => {
        const targetClasses = offer.target_classes || [];
        const targetBranches = offer.target_branches || [];
        const classMatch =
          targetClasses.length === 0 ||
          (userProfile.class && targetClasses.includes(userProfile.class));
        const branchMatch =
          targetBranches.length === 0 ||
          (userProfile.branch && targetBranches.includes(userProfile.branch));
        return classMatch && branchMatch;
      });
    }

    const userBalance = userProfile?.balance || 0;

    const formattedOffers = offers.map((offer) => {
      const price = parseFloat(offer.fixed_price || offer.price || 0);
      const isPurchased = purchasedOfferIds.includes(offer.id);
      return {
        ...offer,
        is_purchased: isPurchased,
        can_purchase: !isPurchased && userBalance >= price,
      };
    });

    res.json({ offers: formattedOffers, userBalance });
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/offers/:offerId
 */
router.get("/:offerId", async (req, res) => {
  try {
    const { offerId } = req.params;

    const result = await pool.query(
      `SELECT o.*,
         COALESCE(
           json_agg(c.*) FILTER (WHERE c.id IS NOT NULL),
           '[]'
         ) AS courses
       FROM offers o
       LEFT JOIN offer_courses oc ON oc.offer_id = o.id
       LEFT JOIN courses c ON c.id = oc.course_id
       WHERE o.id = $1
       GROUP BY o.id`,
      [offerId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Offer not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching offer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
