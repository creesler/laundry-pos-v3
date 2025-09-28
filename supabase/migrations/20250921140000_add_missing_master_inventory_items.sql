-- Location: supabase/migrations/20250921140000_add_missing_master_inventory_items.sql
-- Schema Analysis: pos_inventory_items table exists with correct structure
-- Integration Type: additive - adding missing master inventory items
-- Dependencies: pos_inventory_items table (existing)

-- Add missing master inventory items for Operations Dashboard
-- Master inventory items have pos_session_id = NULL and serve as templates for employee POS sessions

-- First, create a unique constraint to support ON CONFLICT for master items (where pos_session_id IS NULL)
-- This allows multiple items with the same name across different sessions, but only one master template per item name
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_inventory_items_unique 
ON public.pos_inventory_items (item_name) 
WHERE pos_session_id IS NULL;

-- Insert missing master inventory items with proper conflict resolution
-- These items will be available to all employee POS terminals
INSERT INTO public.pos_inventory_items (
    item_name,
    price,
    start_count,
    left_count,
    sold_count,
    add_count,
    quantity,
    total_amount,
    pos_session_id,
    created_at,
    updated_at
) VALUES
    ('Roma 17 63 oz', 2.75, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Xtra 56 oz', 5.50, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Clorox 16 oz', 2.50, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (item_name) WHERE pos_session_id IS NULL DO NOTHING;

-- Add helpful comment explaining the master inventory system
COMMENT ON TABLE public.pos_inventory_items IS 'Inventory items for POS system. Items with pos_session_id = NULL are master templates available to all employees. Items with pos_session_id are session-specific copies.';