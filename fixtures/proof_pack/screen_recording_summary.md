# Screen Recording Summary (20s)

## Time: 0:00-0:03 - Navigate to Rules
- Open `/rules?tenant=101`
- Rules list loads with severity badges
- Click "Multiple Failed Login Attempts" rule

## Time: 0:03-0:06 - Edit and Compile
- Modify DSL query: `event_type:login AND result:failure | stats count() by user, src_ip where count > 10`
- "Compile" button appears
- Click Compile → "Compiling..." → Success indicator

## Time: 0:06-0:10 - Dry Run Test
- Switch to "Dry Run" tab
- Select "15 minutes" time range
- Click "Run Test"
- Results show: "3 matches in 127ms"
- Sample data displays with user/IP details

## Time: 0:10-0:14 - Run Now Modal
- Click "Run Now" button in header
- Modal opens showing:
  - Rule ID: rule_failed_logins
  - Processing Window:
    - From (watermark): Feb 16, 2024, 2:33:45 PM
    - To (now - 120s): Feb 16, 2024, 2:35:45 PM
  - Warning about alert generation
- Click "Run Now" → Processing... → Success

## Time: 0:14-0:17 - Alert Drawer Navigation
- Navigate to `/alerts?tenant=101`
- New alert appears at top of list
- Click alert → Drawer slides open
- Shows rule_failed_logins generated alert

## Time: 0:17-0:20 - Add Note
- Switch to "Notes" tab in drawer
- Type: "Investigated - legitimate failed logins from new employee"
- Click "Add Note"
- Note appears with timestamp and author
- Character count: 52/10000

## Visual Elements Shown:
- ✅ Compile status indicators (green check, red X)
- ✅ Loading skeletons during transitions
- ✅ Rate limit banner (simulated at 0:12)
- ✅ Keyboard navigation (Tab through rule list)
- ✅ Dark mode toggle working
- ✅ Health pills showing CH: OK, Redis: OK
