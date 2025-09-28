-- Location: supabase/migrations/20250921113000_fix_admin_rls_policies.sql
-- Schema Analysis: Existing user_profiles table with RLS policies that require auth.uid()
-- Integration Type: Modification - Update existing RLS policies to support admin operations
-- Dependencies: user_profiles table, existing RLS policies

-- Problem: Admin operations failing due to RLS policy requiring auth.uid() match
-- Solution: Add admin bypass policies and service role access

-- Step 1: Create admin authentication check function
-- This allows admin operations through service role or authenticated admin users
CREATE OR REPLACE FUNCTION public.is_admin_operation()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT 
  -- Check if current role is service_role (for admin operations)
  current_setting('role') = 'service_role'
  OR
  -- Check if authenticated user has admin role in user_profiles
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  )
$$;

-- Step 2: Drop existing restrictive policy and replace with admin-aware policy
DROP POLICY IF EXISTS "users_manage_own_user_profiles" ON public.user_profiles;

-- Step 3: Create new policies that allow admin operations
-- Policy 1: Users can manage their own profiles
CREATE POLICY "users_manage_own_user_profiles"
ON public.user_profiles
FOR ALL
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy 2: Admins can manage all user profiles (for admin dashboard)
CREATE POLICY "admins_manage_all_user_profiles"
ON public.user_profiles
FOR ALL
TO authenticated
USING (public.is_admin_operation())
WITH CHECK (public.is_admin_operation());

-- Policy 3: Service role can manage all user profiles (for backend operations)
CREATE POLICY "service_role_full_access_user_profiles"
ON public.user_profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Step 4: Grant necessary permissions for admin operations
-- Allow service_role to bypass RLS for admin operations
GRANT ALL ON public.user_profiles TO service_role;

-- Step 5: Create admin session management function
-- This allows the frontend to verify admin status without full Supabase auth
CREATE OR REPLACE FUNCTION public.verify_admin_session(admin_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simple password check for admin access (matches frontend logic)
  IF admin_password = 'admin' THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- Step 6: Create admin user management functions that bypass RLS
-- These functions run with elevated privileges for admin operations

CREATE OR REPLACE FUNCTION public.admin_create_employee(
  employee_email TEXT,
  employee_name TEXT,
  employee_role TEXT DEFAULT 'employee'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_employee_id UUID;
BEGIN
  -- Generate new UUID for employee
  new_employee_id := gen_random_uuid();
  
  -- Insert employee with elevated privileges (bypasses RLS)
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (new_employee_id, employee_email, employee_name, employee_role::public.user_role);
  
  RETURN new_employee_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Employee with email % already exists', employee_email;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create employee: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_employee(
  employee_id UUID,
  employee_email TEXT,
  employee_name TEXT,
  employee_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update employee with elevated privileges (bypasses RLS)
  UPDATE public.user_profiles 
  SET 
    email = employee_email,
    full_name = employee_name,
    role = employee_role::public.user_role,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = employee_id;
  
  RETURN FOUND;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update employee: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_employee(employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete employee with elevated privileges (bypasses RLS)
  DELETE FROM public.user_profiles WHERE id = employee_id;
  RETURN FOUND;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete employee: %', SQLERRM;
END;
$$;

-- Step 7: Grant execute permissions on admin functions
GRANT EXECUTE ON FUNCTION public.verify_admin_session(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_employee(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_operation() TO authenticated;

-- Step 8: Update existing policies for other tables to support admin operations
-- Update pos_inventory_items policies
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.pos_inventory_items;

CREATE POLICY "users_manage_pos_inventory_items"
ON public.pos_inventory_items
FOR ALL
TO authenticated
USING (
  -- Allow if user owns the session OR admin operation
  pos_session_id IS NULL -- Master inventory items (no session)
  OR EXISTS (
    SELECT 1 FROM public.pos_sessions ps 
    WHERE ps.id = pos_session_id AND ps.employee_id = auth.uid()
  )
  OR public.is_admin_operation()
)
WITH CHECK (
  pos_session_id IS NULL -- Master inventory items
  OR EXISTS (
    SELECT 1 FROM public.pos_sessions ps 
    WHERE ps.id = pos_session_id AND ps.employee_id = auth.uid()
  )
  OR public.is_admin_operation()
);

-- Step 9: Create comprehensive admin access policy for all POS tables
-- This ensures admin can manage all POS operations

-- pos_sessions admin access
CREATE POLICY "admins_manage_all_pos_sessions"
ON public.pos_sessions
FOR ALL
TO authenticated
USING (public.is_admin_operation())
WITH CHECK (public.is_admin_operation());

-- pos_wash_dry_tickets admin access  
CREATE POLICY "admins_manage_all_wash_dry_tickets"
ON public.pos_wash_dry_tickets
FOR ALL
TO authenticated
USING (public.is_admin_operation())
WITH CHECK (public.is_admin_operation());

-- employee_timesheets admin access
CREATE POLICY "admins_manage_all_timesheets"
ON public.employee_timesheets
FOR ALL
TO authenticated
USING (public.is_admin_operation())
WITH CHECK (public.is_admin_operation());

-- Step 10: Add helpful comments for future maintenance
COMMENT ON FUNCTION public.is_admin_operation() IS 'Checks if current operation is performed by admin user or service role';
COMMENT ON FUNCTION public.verify_admin_session(TEXT) IS 'Verifies admin password for frontend authentication (matches admin login logic)';
COMMENT ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT) IS 'Admin function to create employees bypassing RLS restrictions';
COMMENT ON FUNCTION public.admin_update_employee(UUID, TEXT, TEXT, TEXT) IS 'Admin function to update employees bypassing RLS restrictions';
COMMENT ON FUNCTION public.admin_delete_employee(UUID) IS 'Admin function to delete employees bypassing RLS restrictions';

-- Step 11: Create cleanup function for admin operations
CREATE OR REPLACE FUNCTION public.cleanup_admin_test_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clean up test employees created through admin operations
  DELETE FROM public.user_profiles 
  WHERE email LIKE '%@test.com' OR email LIKE '%@example.com';
  
  RAISE NOTICE 'Admin test data cleanup completed';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Admin cleanup failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_admin_test_data() TO authenticated;