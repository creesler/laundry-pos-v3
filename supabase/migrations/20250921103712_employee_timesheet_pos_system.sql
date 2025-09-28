-- Location: supabase/migrations/20250921103712_employee_timesheet_pos_system.sql
-- Schema Analysis: No existing schema - fresh project
-- Integration Type: Complete new schema creation
-- Dependencies: None - creating base tables

-- 1. Types and Core Tables
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'employee');
CREATE TYPE public.clock_status AS ENUM ('clocked_in', 'clocked_out');
CREATE TYPE public.pos_session_status AS ENUM ('active', 'saved', 'completed');

-- Critical intermediary table for auth relationships
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role public.user_role DEFAULT 'employee'::public.user_role,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Employee timesheet data
CREATE TABLE public.employee_timesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    clock_in_time TIMESTAMPTZ,
    clock_out_time TIMESTAMPTZ,
    work_duration_minutes INTEGER,
    session_date DATE DEFAULT CURRENT_DATE,
    status public.clock_status DEFAULT 'clocked_out'::public.clock_status,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- POS session data
CREATE TABLE public.pos_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    session_date DATE DEFAULT CURRENT_DATE,
    status public.pos_session_status DEFAULT 'active'::public.pos_session_status,
    notes TEXT,
    inventory_total DECIMAL(10,2) DEFAULT 0.00,
    wash_dry_total DECIMAL(10,2) DEFAULT 0.00,
    grand_total DECIMAL(10,2) DEFAULT 0.00,
    cash_started DECIMAL(10,2) DEFAULT 0.00,
    cash_added DECIMAL(10,2) DEFAULT 0.00,
    cash_total DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Inventory items data
CREATE TABLE public.pos_inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pos_session_id UUID REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    start_count INTEGER DEFAULT 0,
    add_count INTEGER DEFAULT 0,
    sold_count INTEGER DEFAULT 0,
    left_count INTEGER DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Wash and dry tickets data
CREATE TABLE public.pos_wash_dry_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pos_session_id UUID REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
    ticket_number TEXT NOT NULL,
    wash_amount DECIMAL(10,2) DEFAULT 0.00,
    dry_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Essential Indexes
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_employee_timesheets_employee_id ON public.employee_timesheets(employee_id);
CREATE INDEX idx_employee_timesheets_session_date ON public.employee_timesheets(session_date);
CREATE INDEX idx_pos_sessions_employee_id ON public.pos_sessions(employee_id);
CREATE INDEX idx_pos_sessions_session_date ON public.pos_sessions(session_date);
CREATE INDEX idx_pos_inventory_items_session_id ON public.pos_inventory_items(pos_session_id);
CREATE INDEX idx_pos_wash_dry_tickets_session_id ON public.pos_wash_dry_tickets(pos_session_id);

-- 3. Functions for automatic profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')::public.user_role
  );  
  RETURN NEW;
END;
$$;

-- Function to calculate work duration
CREATE OR REPLACE FUNCTION public.calculate_work_duration()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.clock_out_time IS NOT NULL AND NEW.clock_in_time IS NOT NULL THEN
    NEW.work_duration_minutes := EXTRACT(EPOCH FROM (NEW.clock_out_time - NEW.clock_in_time)) / 60;
  END IF;
  RETURN NEW;
END;
$$;

-- Function to update POS session totals
CREATE OR REPLACE FUNCTION public.update_pos_session_totals()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    session_id UUID;
    inventory_sum DECIMAL(10,2) := 0;
    wash_dry_sum DECIMAL(10,2) := 0;
BEGIN
    -- Get session_id from the affected row
    IF TG_TABLE_NAME = 'pos_inventory_items' THEN
        session_id := COALESCE(NEW.pos_session_id, OLD.pos_session_id);
    ELSIF TG_TABLE_NAME = 'pos_wash_dry_tickets' THEN
        session_id := COALESCE(NEW.pos_session_id, OLD.pos_session_id);
    END IF;

    -- Calculate inventory total
    SELECT COALESCE(SUM(total_amount), 0) 
    INTO inventory_sum 
    FROM public.pos_inventory_items 
    WHERE pos_session_id = session_id;

    -- Calculate wash/dry total
    SELECT COALESCE(SUM(total_amount), 0) 
    INTO wash_dry_sum 
    FROM public.pos_wash_dry_tickets 
    WHERE pos_session_id = session_id;

    -- Update session totals
    UPDATE public.pos_sessions 
    SET 
        inventory_total = inventory_sum,
        wash_dry_total = wash_dry_sum,
        grand_total = inventory_sum + wash_dry_sum,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = session_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_wash_dry_tickets ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies using Pattern 1 and Pattern 2

-- Pattern 1: Core user table (user_profiles) - Simple only, no functions
CREATE POLICY "users_manage_own_user_profiles"
ON public.user_profiles
FOR ALL
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Pattern 2: Simple user ownership for timesheets
CREATE POLICY "employees_manage_own_timesheets"
ON public.employee_timesheets
FOR ALL
TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

-- Pattern 2: Simple user ownership for POS sessions
CREATE POLICY "employees_manage_own_pos_sessions"
ON public.pos_sessions
FOR ALL
TO authenticated
USING (employee_id = auth.uid())
WITH CHECK (employee_id = auth.uid());

-- Pattern 7: Complex relationship for inventory items - access through session ownership
CREATE OR REPLACE FUNCTION public.can_access_pos_inventory_item(item_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
    SELECT 1 FROM public.pos_sessions ps
    WHERE ps.id = item_session_id 
    AND ps.employee_id = auth.uid()
)
$$;

CREATE POLICY "employees_access_own_pos_inventory_items"
ON public.pos_inventory_items
FOR ALL
TO authenticated
USING (public.can_access_pos_inventory_item(pos_session_id))
WITH CHECK (public.can_access_pos_inventory_item(pos_session_id));

-- Pattern 7: Complex relationship for wash dry tickets - access through session ownership
CREATE OR REPLACE FUNCTION public.can_access_pos_wash_dry_ticket(ticket_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
    SELECT 1 FROM public.pos_sessions ps
    WHERE ps.id = ticket_session_id 
    AND ps.employee_id = auth.uid()
)
$$;

CREATE POLICY "employees_access_own_pos_wash_dry_tickets"
ON public.pos_wash_dry_tickets
FOR ALL
TO authenticated
USING (public.can_access_pos_wash_dry_ticket(pos_session_id))
WITH CHECK (public.can_access_pos_wash_dry_ticket(pos_session_id));

-- 6. Triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER calculate_timesheet_duration
  BEFORE INSERT OR UPDATE ON public.employee_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.calculate_work_duration();

CREATE TRIGGER update_pos_totals_inventory
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_pos_session_totals();

CREATE TRIGGER update_pos_totals_wash_dry
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_wash_dry_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_pos_session_totals();

-- 7. Mock Data for Testing
DO $$
DECLARE
    admin_uuid UUID := gen_random_uuid();
    employee1_uuid UUID := gen_random_uuid();
    employee2_uuid UUID := gen_random_uuid();
    session1_id UUID := gen_random_uuid();
    session2_id UUID := gen_random_uuid();
    timesheet1_id UUID := gen_random_uuid();
    timesheet2_id UUID := gen_random_uuid();
BEGIN
    -- Create auth users with required fields
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
        is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
        recovery_token, recovery_sent_at, email_change_token_new, email_change,
        email_change_sent_at, email_change_token_current, email_change_confirm_status,
        reauthentication_token, reauthentication_sent_at, phone, phone_change,
        phone_change_token, phone_change_sent_at
    ) VALUES
        (admin_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'admin@posystem.com', crypt('admin123', gen_salt('bf', 10)), now(), now(), now(),
         '{"full_name": "Admin Manager", "role": "admin"}'::jsonb, '{"provider": "email", "providers": ["email"]}'::jsonb,
         false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null),
        (employee1_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'angela@posystem.com', crypt('angela123', gen_salt('bf', 10)), now(), now(), now(),
         '{"full_name": "Angela Smith", "role": "employee"}'::jsonb, '{"provider": "email", "providers": ["email"]}'::jsonb,
         false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null),
        (employee2_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'michael@posystem.com', crypt('michael123', gen_salt('bf', 10)), now(), now(), now(),
         '{"full_name": "Michael Johnson", "role": "employee"}'::jsonb, '{"provider": "email", "providers": ["email"]}'::jsonb,
         false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null);

    -- Create POS sessions
    INSERT INTO public.pos_sessions (id, employee_id, session_date, status, notes) VALUES
        (session1_id, employee1_uuid, CURRENT_DATE, 'active'::public.pos_session_status, 'Morning shift session'),
        (session2_id, employee2_uuid, CURRENT_DATE, 'saved'::public.pos_session_status, 'Afternoon shift session');

    -- Create sample inventory items
    INSERT INTO public.pos_inventory_items (pos_session_id, item_name, quantity, price, start_count, add_count, sold_count, left_count, total_amount) VALUES
        (session1_id, 'Downy 19 oz', 1, 5.50, 10, 5, 3, 12, 16.50),
        (session1_id, 'Gain Sheets 15ct', 1, 2.25, 20, 10, 8, 22, 18.00),
        (session2_id, 'Roma 17 63 oz', 1, 2.75, 15, 5, 4, 16, 11.00);

    -- Create sample wash/dry tickets
    INSERT INTO public.pos_wash_dry_tickets (pos_session_id, ticket_number, wash_amount, dry_amount, total_amount) VALUES
        (session1_id, '013', 3.50, 2.00, 5.50),
        (session1_id, '014', 4.00, 2.50, 6.50),
        (session2_id, '015', 3.00, 1.75, 4.75);

    -- Create sample timesheets
    INSERT INTO public.employee_timesheets (id, employee_id, clock_in_time, clock_out_time, session_date, status, notes) VALUES
        (timesheet1_id, employee1_uuid, CURRENT_TIMESTAMP - INTERVAL '8 hours', CURRENT_TIMESTAMP - INTERVAL '30 minutes', CURRENT_DATE, 'clocked_out'::public.clock_status, 'Regular shift completed'),
        (timesheet2_id, employee2_uuid, CURRENT_TIMESTAMP - INTERVAL '4 hours', null, CURRENT_DATE, 'clocked_in'::public.clock_status, 'Currently working');

EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE 'Foreign key error: %', SQLERRM;
    WHEN unique_violation THEN
        RAISE NOTICE 'Unique constraint error: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE NOTICE 'Unexpected error: %', SQLERRM;
END $$;

-- 8. Cleanup function for development
CREATE OR REPLACE FUNCTION public.cleanup_test_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    auth_user_ids_to_delete UUID[];
BEGIN
    -- Get auth user IDs first
    SELECT ARRAY_AGG(id) INTO auth_user_ids_to_delete
    FROM auth.users
    WHERE email LIKE '%@posystem.com';

    -- Delete in dependency order (children first, then auth.users last)
    DELETE FROM public.pos_wash_dry_tickets WHERE pos_session_id IN (SELECT id FROM public.pos_sessions WHERE employee_id = ANY(auth_user_ids_to_delete));
    DELETE FROM public.pos_inventory_items WHERE pos_session_id IN (SELECT id FROM public.pos_sessions WHERE employee_id = ANY(auth_user_ids_to_delete));
    DELETE FROM public.pos_sessions WHERE employee_id = ANY(auth_user_ids_to_delete);
    DELETE FROM public.employee_timesheets WHERE employee_id = ANY(auth_user_ids_to_delete);
    DELETE FROM public.user_profiles WHERE id = ANY(auth_user_ids_to_delete);

    -- Delete auth.users last (after all references are removed)
    DELETE FROM auth.users WHERE id = ANY(auth_user_ids_to_delete);
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE 'Foreign key constraint prevents deletion: %', SQLERRM;
    WHEN OTHERS THEN
        RAISE NOTICE 'Cleanup failed: %', SQLERRM;
END;
$$;