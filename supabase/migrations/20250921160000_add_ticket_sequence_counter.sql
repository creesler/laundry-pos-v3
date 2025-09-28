-- Schema Analysis: pos_sessions and pos_wash_dry_tickets tables exist with ticket_number field
-- Integration Type: addition - adding ticket sequence tracking system
-- Dependencies: existing pos_sessions, pos_wash_dry_tickets tables

-- Create a centralized ticket sequence counter table
CREATE TABLE public.pos_ticket_sequence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    last_ticket_number INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

-- Create index for faster queries
CREATE INDEX idx_pos_ticket_sequence_updated_at ON public.pos_ticket_sequence(updated_at);

-- Enable RLS for the sequence table
ALTER TABLE public.pos_ticket_sequence ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and update ticket sequence
CREATE POLICY "authenticated_users_manage_ticket_sequence"
ON public.pos_ticket_sequence
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Function to get next ticket number atomically
CREATE OR REPLACE FUNCTION public.get_next_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        
        -- Create initial counter record
        INSERT INTO public.pos_ticket_sequence (last_ticket_number, updated_by)
        VALUES (next_number, auth.uid());
    END IF;
    
    -- Increment the counter
    next_number := next_number + 1;
    
    -- Update the counter
    UPDATE public.pos_ticket_sequence 
    SET last_ticket_number = next_number,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = auth.uid()
    WHERE id = (
        SELECT id FROM public.pos_ticket_sequence 
        ORDER BY updated_at DESC 
        LIMIT 1
    );
    
    -- Format with leading zeros (3 digits)
    formatted_number := LPAD(next_number::TEXT, 3, '0');
    
    RETURN formatted_number;
END;
$$;

-- Function to get multiple sequential ticket numbers
CREATE OR REPLACE FUNCTION public.get_sequential_ticket_numbers(count_needed INTEGER DEFAULT 3)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        
        -- Create initial counter record
        INSERT INTO public.pos_ticket_sequence (last_ticket_number, updated_by)
        VALUES (start_number, auth.uid());
    END IF;
    
    -- Generate array of sequential ticket numbers
    FOR i IN 1..count_needed LOOP
        start_number := start_number + 1;
        ticket_numbers := array_append(ticket_numbers, LPAD(start_number::TEXT, 3, '0'));
    END LOOP;
    
    -- Update the counter to the last used number
    UPDATE public.pos_ticket_sequence 
    SET last_ticket_number = start_number,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = auth.uid()
    WHERE id = (
        SELECT id FROM public.pos_ticket_sequence 
        ORDER BY updated_at DESC 
        LIMIT 1
    );
    
    RETURN ticket_numbers;
END;
$$;

-- Function to reset ticket sequence (admin only)
CREATE OR REPLACE FUNCTION public.reset_ticket_sequence(new_start_number INTEGER DEFAULT 0)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = auth.uid() 
        AND up.role = 'admin'
    ) INTO user_is_admin;
    
    IF NOT user_is_admin THEN
        RAISE EXCEPTION 'Only admin users can reset ticket sequence';
        RETURN FALSE;
    END IF;
    
    -- Update or insert the sequence counter
    INSERT INTO public.pos_ticket_sequence (last_ticket_number, updated_by)
    VALUES (new_start_number, auth.uid())
    ON CONFLICT (id) DO UPDATE SET
        last_ticket_number = new_start_number,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = auth.uid();
    
    RETURN TRUE;
END;
$$;

-- Initialize the ticket sequence with current max ticket number
DO $$
DECLARE
    max_existing_ticket INTEGER;
BEGIN
    -- Find highest existing ticket number
    SELECT COALESCE(MAX(CAST(ticket_number AS INTEGER)), 15) 
    INTO max_existing_ticket
    FROM public.pos_wash_dry_tickets
    WHERE ticket_number ~ '^[0-9]+$';
    
    -- Initialize sequence counter
    INSERT INTO public.pos_ticket_sequence (last_ticket_number)
    VALUES (max_existing_ticket);
    
    RAISE NOTICE 'Initialized ticket sequence at number: %', max_existing_ticket;
END;
$$;