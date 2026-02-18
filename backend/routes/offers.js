// =====================================================
// OFFERS API ROUTES
// =====================================================
import express from "express";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

/**
 * GET /api/offers
 * Get all active offers with their courses and features
 */
router.get("/", async (req, res) => {
    try {
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

        // Format the response to be cleaner
        const formattedOffers = offers.map(offer => ({
            ...offer,
            courses: offer.courses.map(oc => oc.course)
        }));

        res.json(formattedOffers);
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
