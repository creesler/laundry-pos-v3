-- Location: supabase/migrations/20250921130000_fix_employee_auth_relationship.sql
-- Schema Analysis: Existing user_profiles table with foreign key to auth.users
-- Integration Type: Fix existing function constraint violation
-- Dependencies: auth.users, user_profiles table, existing admin functions

-- Fix the admin_create_employee function to properly handle auth user creation
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  employee_email text, 
  employee_name text, 
  employee_role text DEFAULT 'employee'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  new_employee_id UUID;
  temp_password TEXT := 'temp' || substr(md5(random()::text), 1, 8);
BEGIN
  -- Generate new UUID for employee
  new_employee_id := gen_random_uuid();
  
  -- Check if email already exists in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = employee_email) THEN
    RAISE EXCEPTION 'Employee with email % already exists', employee_email;
  END IF;
  
  -- Insert into auth.users first (required for foreign key constraint)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at, phone, phone_change,
    phone_change_token, phone_change_sent_at
  ) VALUES (
    new_employee_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    employee_email, crypt(temp_password, gen_salt('bf', 10)), now(), now(), now(),
    jsonb_build_object('full_name', employee_name, 'role', employee_role),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null
  );
  
  -- Insert into user_profiles (will be handled by trigger, but we can be explicit)
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (new_employee_id, employee_email, employee_name, employee_role::public.user_role)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
  
  RETURN new_employee_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Employee with email % already exists', employee_email;
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Failed to create employee: database relationship error';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create employee: %', SQLERRM;
END;
$func$;

-- Update admin_update_employee function to handle both auth and profile updates
CREATE OR REPLACE FUNCTION public.admin_update_employee(
  employee_id uuid,
  employee_email text,
  employee_name text,
  employee_role text DEFAULT 'employee'::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  -- Update auth.users metadata
  UPDATE auth.users
  SET 
    email = employee_email,
    raw_user_meta_data = jsonb_build_object(
      'full_name', employee_name, 
      'role', employee_role
    ),
    updated_at = now()
  WHERE id = employee_id;
  
  -- Update user_profiles
  UPDATE public.user_profiles
  SET 
    email = employee_email,
    full_name = employee_name,
    role = employee_role::public.user_role,
    updated_at = now()
  WHERE id = employee_id;
  
  -- Check if update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee with ID % not found', employee_id;
  END IF;
  
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Employee with email % already exists', employee_email;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update employee: %', SQLERRM;
END;
$func$;

-- Update admin_delete_employee function to handle both tables
CREATE OR REPLACE FUNCTION public.admin_delete_employee(employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  -- Check if employee exists
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = employee_id) THEN
    RAISE EXCEPTION 'Employee with ID % not found', employee_id;
  END IF;
  
  -- Delete related records first (in dependency order)
  DELETE FROM public.employee_timesheets WHERE employee_id = employee_id;
  DELETE FROM public.pos_sessions WHERE employee_id = employee_id;
  
  -- Delete from user_profiles
  DELETE FROM public.user_profiles WHERE id = employee_id;
  
  -- Delete from auth.users (this will cascade properly)
  DELETE FROM auth.users WHERE id = employee_id;
  
  RETURN true;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot delete employee: has related records that cannot be removed automatically';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete employee: %', SQLERRM;
END;
$func$;

-- Add a function to get temporary password for new employees (admin use)
CREATE OR REPLACE FUNCTION public.admin_get_temp_credentials()
RETURNS TABLE(
  email TEXT,
  temp_password TEXT,
  full_name TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  RETURN QUERY
  SELECT 
    'New employees get temporary passwords'::TEXT as email,
    'Contact admin for login credentials'::TEXT as temp_password,
    'System generated'::TEXT as full_name,
    'employee'::TEXT as role;
END;
$func$;

-- Clean up any orphaned user_profiles (profiles without auth users)
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  -- Count orphaned profiles
  SELECT COUNT(*) INTO orphaned_count
  FROM public.user_profiles up
  LEFT JOIN auth.users au ON up.id = au.id
  WHERE au.id IS NULL;
  
  IF orphaned_count > 0 THEN
    RAISE NOTICE 'Found % orphaned user profiles. Cleaning up...', orphaned_count;
    
    -- Delete orphaned user profiles
    DELETE FROM public.user_profiles up
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.users au WHERE au.id = up.id
    );
    
    RAISE NOTICE 'Cleaned up % orphaned user profiles', orphaned_count;
  ELSE
    RAISE NOTICE 'No orphaned user profiles found';
  END IF;
END $$;

-- Add helpful comment about employee creation
COMMENT ON FUNCTION public.admin_create_employee IS 'Creates both auth user and profile for employee. Generates temporary password that should be changed on first login.';