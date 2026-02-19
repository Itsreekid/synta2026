-- =====================================================
-- ADMIN PASSWORD MANAGEMENT
-- Run this in your Supabase SQL Editor
-- =====================================================

-- This function allows an admin to change the password for any user
-- It runs with SECURITY DEFINER to have access to the auth schema
CREATE OR REPLACE FUNCTION public.admin_update_user_password(
    target_user_id UUID,
    new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    -- 1. Verify that the person calling this function is an admin
    SELECT role INTO caller_role FROM public."Users" WHERE id = auth.uid();
    
    IF caller_role != 'admin' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Unauthorized: Only admins can change passwords.'
        );
    END IF;

    -- 2. Update the password in auth.users
    -- Supabase uses bcrypt for password hashing
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf'))
    WHERE id = target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Password updated successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execution permission to authenticated users
-- (The function itself checks for admin role internally)
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(UUID, TEXT) TO authenticated;
