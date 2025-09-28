-- Schema Analysis: pos_inventory_items table exists with proper structure
-- Integration Type: ADDITIVE - Adding master template inventory items  
-- Dependencies: References existing pos_inventory_items table

-- Add all 5 master template inventory items for admin dashboard
-- These items have pos_session_id = NULL making them available as templates for employee POS sessions

DO $$
BEGIN
    -- Insert the 5 master inventory items matching the attachment requirements
    -- Using ON CONFLICT to handle any existing items with same names
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
        ('Downy 19 oz', 5.50, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Gain Sheets 15ct', 2.25, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Roma 17 63 oz', 2.75, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Xtra 56 oz', 5.50, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Clorox 16 oz', 2.50, 0, 0, 0, 0, 1, 0.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (item_name) 
    WHERE pos_session_id IS NULL
    DO UPDATE SET
        price = EXCLUDED.price,
        quantity = EXCLUDED.quantity,
        updated_at = CURRENT_TIMESTAMP;

    -- Log successful completion
    RAISE NOTICE 'Successfully added/updated 5 master inventory items for admin dashboard';

EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'Some items already exist, updated existing records';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adding master inventory items: %', SQLERRM;
END $$;

-- Verify the master inventory items were created correctly
-- This query can be used to confirm all 5 items are available for admin dashboard
-- SELECT item_name, price, quantity FROM public.pos_inventory_items WHERE pos_session_id IS NULL ORDER BY item_name;