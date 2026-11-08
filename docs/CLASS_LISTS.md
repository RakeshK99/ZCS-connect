# Class lists

Who is in each class or section comes from two places:

1. **Before each semester:** ZCS shares its class lists, for example in the shared Drive folder.
   The office (or Syzygy, the first time) uploads them in the staff website under **Class lists**.
2. **During the semester:** teachers fix their own classes in the app. In **Classes**, open a class,
   then **Add a student** or open a student and choose **Remove from …**.

Families and their contact details still come from **Roster import**, and only the office changes
them. Teachers can only add students who are already on the school's list, so they can't link
themselves to a family that isn't in their class, and custody (no contact) rules stay with the office.

## The spreadsheet

One row per student per class. The columns can be in any order and any extra columns are ignored.

| Section Code | Course Name | Teacher Email | Student ID | Student Name |
| --- | --- | --- | --- | --- |
| 7MATH-A | Math 7 | jdoe@zcs.org | 1001 | VanDyke, Emma |
| 7MATH-A | Math 7 | jdoe@zcs.org | 1002 | Bakker, Ava |
| 3S | Mrs. Smith's 3rd Grade | jsmith@zcs.org | 1003 | Smith, Lily |

- **Class or section code (required):** the same code every semester when it's the same class.
- **Teacher email:** school addresses only. Co-teachers or aides can go in one cell, separated by
  `;`. A teacher who isn't in ZCS Connect yet is added automatically.
- **Student:** the student ID from the student system is best. A first and last name also works
  when only one student has that name.
- **Middle school:** list every section, so each teacher reaches the students in their sections and
  families see all of their child's teachers in Messages.

## What the import does

- It shows a preview first: new and updated classes, students added and taken off, teachers added
  and taken off, and any rows it couldn't match (for example, a student who isn't on the school's
  list yet).
- Each class **in the file** is made to match it exactly. Classes **not in the file** don't change,
  so you can upload one grade or one pilot class at a time.
- Every import, and every change a teacher makes, is recorded in the audit log
  (`roster.class_lists`, `class.student_added`, `class.student_removed`).
