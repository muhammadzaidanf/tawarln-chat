import { createClient } from '@supabase/supabase-js';

// GANTI DENGAN KUNCI DARI DASHBOARD SUPABASE LU
const supabaseUrl = 'https://akyhgmmsjhktnsodqlaz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFreWhnbW1zamhrdG5zb2RxbGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDI3NDMsImV4cCI6MjA4MjQxODc0M30.jZstfofLSZmOagfvAGo8ZCx4TleVPP4mKnb-vISC-Zk';

export const supabase = createClient(supabaseUrl, supabaseKey);