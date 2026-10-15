// lib/studio/schedule.ts ← "ตั้งเวลาปล่อย" (typing the release date/time into Studio)
export default {
  file: 'lib/studio/schedule.ts',
  regions: ['1383-1506'],
  subs: [
    // P5-draft-retry ("Could not open the calendar" on a long video): the click goes to the date field in the
    // dialog now, not to the element found before the wait (Studio may have drawn it again); the failure logs
    // what the page held and says when the tab was in the background. Neither was seen in Chrome
    ['trigger.click();', '(dlg.querySelector(SEL.datePickerTrigger) || trigger).click();', 1],
    ["return L('เปิดปฏิทินไม่ได้', 'Could not open the calendar');", "return L('เปิดปฏิทินไม่ได้', 'Could not open the calendar') + calendarNote(trigger);", 1],
  ],
};
