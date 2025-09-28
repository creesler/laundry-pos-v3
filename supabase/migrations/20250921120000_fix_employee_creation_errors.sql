-- Location: supabase/migrations/20250921120000_fix_employee_creation_errors.sql
-- Schema Analysis: Existing POS system with user_profiles, admin functions, and RLS policies
-- Integration Type: Modificative - fixing existing function constraints and errors
-- Dependencies: user_profiles table, admin functions

-- Fix the admin_create_employee function to handle constraint violations properly
CREATE OR REPLACE FUNCTION public.admin_create_employee(
    employee_email text,
    employee_name text,
    employee_role text DEFAULT 'employee'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    new_employee_id UUID;
    existing_user UUID;
BEGIN
    -- Check if user with this email already exists
    SELECT id INTO existing_user FROM public.user_profiles WHERE email = employee_email;
    
    IF existing_user IS NOT NULL THEN
        RAISE EXCEPTION 'Employee with email % already exists', employee_email;
    END IF;
    
    -- Generate new UUID for employee
    new_employee_id := gen_random_uuid();
    
    -- Validate role enum
    IF employee_role NOT IN ('admin', 'manager', 'employee') THEN
        employee_role := 'employee';
    END IF;
    
    -- Insert employee with explicit column specification
    INSERT INTO public.user_profiles (id, email, full_name, role, created_at, updated_at)
    VALUES (
        new_employee_id, 
        employee_email, 
        employee_name, 
        employee_role::public.user_role,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
    
    RETURN new_employee_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Employee with email % already exists', employee_email;
    WHEN check_violation THEN
        RAISE EXCEPTION 'Invalid role specified: %. Must be admin, manager, or employee', employee_role;
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'Database constraint violation. Please contact administrator';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create employee: %', SQLERRM;
END;
$function$;

-- Ensure the admin_update_employee function is also robust
CREATE OR REPLACE FUNCTION public.admin_update_employee(
    employee_id uuid,
    employee_name text,
    employee_email text,
    employee_role text DEFAULT 'employee'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    existing_user UUID;
    rows_affected INTEGER;
BEGIN
    -- Check if employee exists
    SELECT id INTO existing_user FROM public.user_profiles WHERE id = employee_id;
    
    IF existing_user IS NULL THEN
        RAISE EXCEPTION 'Employee with ID % not found', employee_id;
    END IF;
    
    -- Check if email is taken by another user
    SELECT id INTO existing_user FROM public.user_profiles 
    WHERE email = employee_email AND id != employee_id;
    
    IF existing_user IS NOT NULL THEN
        RAISE EXCEPTION 'Email % already taken by another employee', employee_email;
    END IF;
    
    -- Validate role enum
    IF employee_role NOT IN ('admin', 'manager', 'employee') THEN
        employee_role := 'employee';
    END IF;
    
    -- Update employee record
    UPDATE public.user_profiles 
    SET 
        email = employee_email,
        full_name = employee_name,
        role = employee_role::public.user_role,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = employee_id;
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    
    IF rows_affected = 0 THEN
        RAISE EXCEPTION 'Failed to update employee with ID %', employee_id;
    END IF;
    
    RETURN true;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Email % already taken by another employee', employee_email;
    WHEN check_violation THEN
        RAISE EXCEPTION 'Invalid role specified: %. Must be admin, manager, or employee', employee_role;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to update employee: %', SQLERRM;
END;
$function$;

-- Create a helper function to validate user_profiles constraints
CREATE OR REPLACE FUNCTION public.validate_user_profile_data(
    check_email text,
    check_name text,
    check_role text DEFAULT 'employee'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Validate email format
    IF check_email IS NULL OR check_email = '' OR check_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid email format: %', check_email;
    END IF;
    
    -- Validate name
    IF check_name IS NULL OR trim(check_name) = '' THEN
        RAISE EXCEPTION 'Name cannot be empty';
    END IF;
    
    -- Validate role
    IF check_role NOT IN ('admin', 'manager', 'employee') THEN
        RAISE EXCEPTION 'Invalid role: %. Must be admin, manager, or employee', check_role;
    END IF;
    
    RETURN true;
END;
$function$;

-- Add a function to safely delete employees (handles dependencies)
CREATE OR REPLACE FUNCTION public.admin_delete_employee(employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    existing_user UUID;
    rows_affected INTEGER;
BEGIN
    -- Check if employee exists
    SELECT id INTO existing_user FROM public.user_profiles WHERE id = employee_id;
    
    IF existing_user IS NULL THEN
        RAISE EXCEPTION 'Employee with ID % not found', employee_id;
    END IF;
    
    -- Delete related records first (to avoid constraint violations)
    DELETE FROM public.employee_timesheets WHERE employee_id = employee_id;
    DELETE FROM public.pos_sessions WHERE employee_id = employee_id;
    
    -- Delete the employee record
    DELETE FROM public.user_profiles WHERE id = employee_id;
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    
    IF rows_affected = 0 THEN
        RAISE EXCEPTION 'Failed to delete employee with ID %', employee_id;
    END IF;
    
    RETURN true;
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'Cannot delete employee: has related records that prevent deletion';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to delete employee: %', SQLERRM;
END;
$function$;

-- Create indexes to improve constraint checking performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_lower ON public.user_profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles (role);

-- Add a comment to document the fix
COMMENT ON FUNCTION public.admin_create_employee IS 'Fixed function to handle employee creation with proper constraint validation and error handling';
COMMENT ON FUNCTION public.admin_update_employee IS 'Enhanced function to handle employee updates with comprehensive validation';
COMMENT ON FUNCTION public.admin_delete_employee IS 'Safe employee deletion function that handles related record cleanup';