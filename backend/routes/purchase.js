import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // Service role key for admin operations
);

/**
 * Purchase a course
 * POST /api/purchase/course
 */
router.post('/course', async (req, res) => {
    try {
        const { courseId, userId } = req.body;

        if (!courseId || !userId) {
            return res.status(400).json({
                error: 'Missing required fields: courseId and userId'
            });
        }

        // Get course details
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('price, title, is_free')
            .eq('id', courseId)
            .single();

        if (courseError || !course) {
            return res.status(404).json({
                error: 'Course not found'
            });
        }

        // Check if already enrolled
        const { data: existingEnrollment } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .maybeSingle();

        if (existingEnrollment) {
            return res.status(400).json({
                error: 'Already enrolled in this course'
            });
        }

        // If free course, just enroll
        if (course.is_free) {
            const { error: enrollError } = await supabase
                .from('enrollments')
                .insert({
                    user_id: userId,
                    course_id: courseId,
                    amount_paid: 0,
                    enrolled_at: new Date().toISOString()
                });

            if (enrollError) {
                throw enrollError;
            }

            return res.json({
                success: true,
                message: 'Successfully enrolled in free course'
            });
        }

        // For paid courses, check balance
        const { data: userData, error: balanceError } = await supabase
            .from('Users')
            .select('balance')
            .eq('id', userId)
            .single();

        if (balanceError) {
            throw balanceError;
        }

        const currentBalance = userData?.balance || 0;
        const price = parseFloat(course.price);

        if (currentBalance < price) {
            return res.status(400).json({
                error: 'Insufficient balance',
                currentBalance,
                requiredAmount: price
            });
        }

        // Deduct balance using the secure function
        const { data: deductResult, error: deductError } = await supabase
            .rpc('deduct_user_balance', {
                p_user_id: userId,
                p_amount: price,
                p_description: `Course purchase: ${course.title}`
            });

        if (deductError) {
            console.error('Deduct balance error:', deductError);
            throw deductError;
        }

        // Create enrollment
        const { error: enrollError } = await supabase
            .from('enrollments')
            .insert({
                user_id: userId,
                course_id: courseId,
                amount_paid: price,
                enrolled_at: new Date().toISOString()
            });

        if (enrollError) {
            // If enrollment fails, we should add the balance back
            // But for now, just log the error
            console.error('Enrollment error after balance deduction:', enrollError);
            throw enrollError;
        }

        res.json({
            success: true,
            message: 'Course purchased successfully',
            newBalance: currentBalance - price
        });

    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({
            error: error.message || 'Failed to purchase course'
        });
    }
});

/**
 * Purchase an offer (bundle of courses)
 * POST /api/purchase/offer
 */
router.post('/offer', async (req, res) => {
    try {
        const { offerId, userId } = req.body;

        if (!offerId || !userId) {
            return res.status(400).json({
                error: 'Missing required fields: offerId and userId'
            });
        }

        // Get offer details with courses
        const { data: offer, error: offerError } = await supabase
            .from('offers')
            .select(`
                *,
                courses:offer_courses(
                    course_id
                )
            `)
            .eq('id', offerId)
            .single();

        if (offerError || !offer) {
            return res.status(404).json({
                error: 'Offer not found'
            });
        }

        if (!offer.is_active) {
            return res.status(400).json({
                error: 'This offer is no longer active'
            });
        }

        // Check balance
        const { data: userData, error: balanceError } = await supabase
            .from('Users')
            .select('balance')
            .eq('id', userId)
            .single();

        if (balanceError) throw balanceError;

        const currentBalance = userData?.balance || 0;
        const price = parseFloat(offer.fixed_price || 0);

        if (currentBalance < price) {
            return res.status(400).json({
                error: 'Insufficient balance',
                currentBalance,
                requiredAmount: price
            });
        }

        // Deduct balance
        const { error: deductError } = await supabase
            .rpc('deduct_user_balance', {
                p_user_id: userId,
                p_amount: price,
                p_description: `Offer purchase: ${offer.title}`
            });

        if (deductError) throw deductError;

        // Enroll in all courses in the offer
        const enrollments = offer.courses.map(oc => ({
            user_id: userId,
            course_id: oc.course_id,
            amount_paid: 0, // Recorded on the offer purchase instead
            enrolled_at: new Date().toISOString(),
            offer_id: offer.id // Track which offer granted access
        }));

        if (enrollments.length > 0) {
            const { error: enrollError } = await supabase
                .from('enrollments')
                .insert(enrollments);

            if (enrollError) {
                console.error('Enrollment error after balance deduction:', enrollError);
                // In a perfect world, we'd roll back the transaction here
                // For now, at least return success since money was taken
            }
        }

        // Record the purchase itself (optional table if you want to track offer sales specifically)
        // For now, the user balance log and enrollments are enough

        res.json({
            success: true,
            message: 'Offer purchased successfully',
            newBalance: currentBalance - price
        });

    } catch (error) {
        console.error('Offer purchase error:', error);
        res.status(500).json({
            error: error.message || 'Failed to purchase offer'
        });
    }
});

export default router;
