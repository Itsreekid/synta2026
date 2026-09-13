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
            const response = await fetch('/api/admin/overview-stats');
            if (!response.ok) throw new Error('Failed to fetch overview stats');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error loading admin overview:', error);
            return { success: false, error: error.message };
        }
    },

    async loadOffers() {
        try {
            const response = await fetch('/api/admin/offers');
            if (!response.ok) throw new Error('Failed to fetch offers');
            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error('Error loading offers:', error);
            return [];
        }
    },

    async loadStudents(page = 1, pageSize = 10, searchTerm = '', classFilter = '', branchFilter = '') {
        try {
            const params = new URLSearchParams({
                page,
                pageSize,
                searchTerm,
                classFilter,
                branchFilter
            });
            const response = await fetch(`/api/admin/students?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch students');
            const result = await response.json();
            return { data: result.data, count: result.count };
        } catch (error) {
            console.error('Error loading students:', error);
            return { data: [], count: 0 };
        }
    },

    async manageOffer(data) {
        try {
            const response = await fetch('/api/admin/offers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error('Failed to manage offer');
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error managing offer:', error);
            return { success: false, error: error.message };
        }
    },

    async changeStudentPassword(studentId, newPassword) {
        try {
            const response = await fetch('/api/admin/change-student-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, newPassword })
            });
            if (!response.ok) throw new Error('Failed to change password');
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error changing student password:', error);
            return { success: false, error: error.message };
        }
    }
};

// Export to window
window.AdminDashboard = AdminDashboard;
