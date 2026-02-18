// =====================================================
// OFFERS API ROUTES
// =====================================================
import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/offers
 * Get active offers, filtered by user profile if authenticated
 */
router.get("/", authMiddleware, async (req, res) => {
    try {
        let userProfile = null;

        // If user is logged in, fetch their profile (class, branch, balance)
        if (req.user) {
            const { data: profile } = await supabaseAdmin
                .from("Users")
                .select("class, branch, balance")
                .eq("id", req.user.id)
                .single();
            userProfile = profile;
        }

        const { data: offers, error } = await supabaseAdmin
            .from("offers")
            .select(`
                *,
                courses:offer_courses(
                    course:courses(*)
                )
            `)
            .eq("is_active", true)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching offers:", error);
            return res.status(500).json({ error: "Failed to fetch offers" });
        }

        // Filter offers based on targeting
        let filteredOffers = offers;

        if (userProfile) {
            filteredOffers = offers.filter(offer => {
                const targetClasses = offer.target_classes || [];
                const targetBranches = offer.target_branches || [];

                // Match class if targeting is defined
                const classMatch = targetClasses.length === 0 ||
                    (userProfile.class && targetClasses.includes(userProfile.class));

                // Match branch if targeting is defined
                const branchMatch = targetBranches.length === 0 ||
                    (userProfile.branch && targetBranches.includes(userProfile.branch));

                return classMatch && branchMatch;
            });
        }

        const userBalance = userProfile?.balance || 0;

        // Format the response to be cleaner
        const formattedOffers = filteredOffers.map(offer => {
            const price = parseFloat(offer.fixed_price || offer.price || 0);
            return {
                ...offer,
                courses: offer.courses.map(oc => oc.course),
                can_purchase: userBalance >= price
            };
        });

        res.json({
            offers: formattedOffers,
            userBalance: userBalance
        });
    } catch (error) {
        console.error("Error fetching offers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/offers/:offerId
 * Get single offer details
 */
router.get("/:offerId", async (req, res) => {
    try {
        const { offerId } = req.params;

        const { data: offer, error } = await supabaseAdmin
            .from("offers")
            .select(`
        *,
        courses:offer_courses(
          course:courses(*)
        )
      `)
            .eq("id", offerId)
            .single();

        if (error || !offer) {
            return res.status(404).json({ error: "Offer not found" });
        }

        // Format response
        offer.courses = offer.courses.map(oc => oc.course);

        res.json(offer);
    } catch (error) {
        console.error("Error fetching offer:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
