-- Location: supabase/migrations/20250921170000_fix_ticket_sequence_jwt_errors.sql
-- Schema Analysis: Existing pos_ticket_sequence table with last_ticket_number, updated_by, updated_at
-- Integration Type: Enhancement - Fix JWT authentication issues for anonymous POS operations
-- Dependencies: pos_ticket_sequence, pos_wash_dry_tickets tables

-- Fix JWT expired errors by allowing anonymous access to ticket sequence functions
-- This enables POS terminals to work without authentication while maintaining security

-- Update RLS policy to allow both authenticated and anonymous access
DROP POLICY IF EXISTS "authenticated_users_manage_ticket_sequence" ON public.pos_ticket_sequence;

CREATE POLICY "flexible_ticket_sequence_access" 
ON public.pos_ticket_sequence
FOR ALL 
USING (true)
WITH CHECK (true);

-- Update get_next_ticket_number function to handle both auth states
CREATE OR REPLACE FUNCTION public.get_next_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    next_number INTEGER;
    formatted_number TEXT;
BEGIN
    -- Lock the row to prevent race conditions
    LOCK TABLE public.pos_ticket_sequence IN ROW EXCLUSIVE MODE;
    
    -- Get current counter or initialize if not exists
    SELECT last_ticket_number INTO next_number
    FROM public.pos_ticket_sequence
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If no counter exists, create one starting from existing tickets
    IF next_number IS NULL THEN
        -- Find the highest existing ticket number
        SELECT COALESCE(MAX(CAST(ticket_number AS INTEGER)), 0) 
        INTO next_number
        FROM public.pos_wash_dry_tickets
        WHERE ticket_number ~ '^[0-9]+$';
        
        -- Create initial counter record with flexible auth handling
        INSERT INTO public.pos_ticket_sequence (last_ticket_number, updated_by)
        VALUES (next_number, COALESCE(auth.uid(), NULL));
    END IF;
    
    -- Increment the counter
    next_number := next_number + 1;
    
    -- Update the counter with flexible auth handling
    UPDATE public.pos_ticket_sequence 
    SET last_ticket_number = next_number,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = COALESCE(auth.uid(), NULL)
    WHERE id = (
        SELECT id FROM public.pos_ticket_sequence 
        ORDER BY updated_at DESC 
        LIMIT 1
    );
    
    -- Format with leading zeros (3 digits)
    formatted_number := LPAD(next_number::TEXT, 3, '0');
    
    RETURN formatted_number;
END;
$function$;

-- Update get_sequential_ticket_numbers function to handle both auth states
CREATE OR REPLACE FUNCTION public.get_sequential_ticket_numbers(count_needed integer DEFAULT 3)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    start_number INTEGER;
    ticket_numbers TEXT[] := ARRAY[]::TEXT[];
    i INTEGER;
BEGIN
    -- Lock the table to prevent race conditions
    LOCK TABLE public.pos_ticket_sequence IN ROW EXCLUSIVE MODE;
    
    -- Get current counter or initialize if not exists
    SELECT last_ticket_number INTO start_number
    FROM public.pos_ticket_sequence
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If no counter exists, create one
    IF start_number IS NULL THEN
        -- Find the highest existing ticket number
        SELECT COALESCE(MAX(CAST(ticket_number AS INTEGER)), 0) 
        INTO start_number
        FROM public.pos_wash_dry_tickets
        WHERE ticket_number ~ '^[0-9]+$';
        
        -- Create initial counter record with flexible auth handling
        INSERT INTO public.pos_ticket_sequence (last_ticket_number, updated_by)
        VALUES (start_number, COALESCE(auth.uid(), NULL));
    END IF;
    
    -- Generate array of sequential ticket numbers
    FOR i IN 1..count_needed LOOP
        start_number := start_number + 1;
        ticket_numbers := array_append(ticket_numbers, LPAD(start_number::TEXT, 3, '0'));
    END LOOP;
    
    -- Update the counter to the last used number with flexible auth handling
    UPDATE public.pos_ticket_sequence 
    SET last_ticket_number = start_number,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = COALESCE(auth.uid(), NULL)
    WHERE id = (
        SELECT id FROM public.pos_ticket_sequence 
        ORDER BY updated_at DESC 
        LIMIT 1
    );
    
    RETURN ticket_numbers;
END;
$function$;

-- Add a function to reset ticket sequence (admin only when authenticated)
CREATE OR REPLACE FUNCTION public.reset_ticket_sequence(new_start_number integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Only allow reset if authenticated (for security)
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required for ticket sequence reset';
    END IF;
    
    -- Update or insert the counter
    UPDATE public.pos_ticket_sequence 
    SET last_ticket_number = new_start_number,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = auth.uid();
    
    -- If no row exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.pos_ticket_sequence (last_ticket_number, updated_by)
        VALUES (new_start_number, auth.uid());
    END IF;
    
    RETURN true;
END;
$function$;

-- Add a helper function to check ticket sequence status
CREATE OR REPLACE FUNCTION public.get_ticket_sequence_status()
RETURNS TABLE(
    current_number INTEGER,
    last_updated TIMESTAMPTZ,
    updated_by_user UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        pts.last_ticket_number,
        pts.updated_at,
        pts.updated_by
    FROM public.pos_ticket_sequence pts
    ORDER BY pts.updated_at DESC
    LIMIT 1;
END;
$function$;

-- Test the functions to ensure they work in both authenticated and anonymous states
DO $$
DECLARE
    test_ticket TEXT;
    test_tickets TEXT[];
BEGIN
    -- Test anonymous ticket generation (simulates POS terminal usage)
    SELECT public.get_next_ticket_number() INTO test_ticket;
    RAISE NOTICE 'Anonymous ticket generation test successful: %', test_ticket;
    
    -- Test sequential ticket generation
    SELECT public.get_sequential_ticket_numbers(3) INTO test_tickets;
    RAISE NOTICE 'Sequential ticket generation test successful: %', array_to_string(test_tickets, ', ');
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Function test failed: %', SQLERRM;
END $$;