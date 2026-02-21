/**
 * Admin Dashboard Core Utilities
 */

const AdminDashboard = {
    // Supabase client will be accessed via window.auth.supabase

    /**
     * loadOverview: Fetch and return general stats
     */
    async loadOverview() {
        try {
            const { supabase } = window.auth;

            // 1. Get student count
            const { count: studentCount, error: studentError } = await supabase
                .from('Users')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'student');

            // 2. Get offer count
            const { count: offerCount, error: offerError } = await supabase
                .from('offers')
                .select('*', { count: 'exact', head: true });

            // 3. Get total revenue (sum of amount from purchases with status 'completed')
            const { data: purchases, error: purchaseError } = await supabase
                .from('purchases')
                .select('amount')
                .eq('payment_status', 'completed');

            const totalRevenue = purchases?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;

            return {
                students: studentCount || 0,
                offers: offerCount || 0,
                revenue: totalRevenue.toFixed(2),
                success: true
            };
        } catch (error) {
            console.error('Error loading admin overview:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * loadOffers: Fetch all offers from DB
     */
    async loadOffers() {
        try {
            const { supabase } = window.auth;
            const { data, error } = await supabase
                .from('offers')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error loading offers:', error);
            return [];
        }
    },

    /**
     * loadStudents: Fetch all students
     */
    async loadStudents() {
        try {
            const { supabase } = window.auth;
            const { data, error } = await supabase
                .from('Users')
                .select('id, fullname, email, number, class, branch, created_at, balance')
                .eq('role', 'student')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error loading students:', error);
            return [];
        }
    },

    /**
     * manageOffer: Create or Update an offer
     */
    async manageOffer(data) {
        try {
            const { supabase } = window.auth;
            let result;

            if (data.id) {
                // Update
                result = await supabase
                    .from('offers')
                    .update({
                        title: data.title,
                        description: data.description,
                        fixed_price: data.fixed_price,
                        discount_percentage: data.discount_percentage,
                        is_active: data.is_active,
                        target_classes: data.target_classes || [],
                        target_branches: data.target_branches || [],
                        valid_from: data.valid_from,
                        valid_until: data.valid_until
                    })
                    .eq('id', data.id);
            } else {
                // Create
                result = await supabase
                    .from('offers')
                    .insert([{
                        title: data.title,
                        description: data.description,
                        fixed_price: data.fixed_price,
                        discount_percentage: data.discount_percentage,
                        is_active: data.is_active,
                        target_classes: data.target_classes || [],
                        target_branches: data.target_branches || [],
                        valid_from: data.valid_from,
                        valid_until: data.valid_until
                    }]);
            }

            if (result.error) throw result.error;
            return { success: true };
        } catch (error) {
            console.error('Error managing offer:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * changeStudentPassword: Reset a student's password
     */
    async changeStudentPassword(studentId, newPassword) {
        try {
            const { supabase } = window.auth;
            const { data, error } = await supabase.rpc('admin_update_user_password', {
                target_user_id: studentId,
                new_password: newPassword
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error changing student password:', error);
            return { success: false, error: error.message };
        }
    }
};

// Export to window
window.AdminDashboard = AdminDashboard;
