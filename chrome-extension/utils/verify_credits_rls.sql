-- Verify Credits RLS Policies
-- Run this in Supabase SQL Editor to ensure credits system works correctly

-- ============================================
-- PART 1: Verify Users Table RLS
-- ============================================

-- Check if users table has UPDATE policy
-- Users should be able to UPDATE their own credits_balance and credits_used
-- This should already exist from setup_complete.sql, but we verify it here

-- The policy "Users can update their own profile" should allow updating credits_balance
-- If it doesn't exist, create it:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON public.users FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ============================================
-- PART 2: Verify Credits Transactions RLS
-- ============================================

-- Ensure credits_transactions table exists and has correct policies
-- These should already exist from migration_add_credits.sql

-- Verify SELECT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'credits_transactions' 
    AND policyname = 'Users can view their own credits transactions'
  ) THEN
    CREATE POLICY "Users can view their own credits transactions"
      ON public.credits_transactions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Verify INSERT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'credits_transactions' 
    AND policyname = 'Users can insert their own credits transactions'
  ) THEN
    CREATE POLICY "Users can insert their own credits transactions"
      ON public.credits_transactions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- PART 3: Summary
-- ============================================

-- Show current policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('users', 'credits_transactions')
ORDER BY tablename, policyname;
