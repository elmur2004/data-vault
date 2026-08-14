# Database
## Technical Specification and Scope Document

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | 4 August 2026 |
| **Audience** | Software Department |
| **Status** | For estimation. Decision D-01 must be answered first |
| **Working name** | Database. See Section 2 |

---

## 1. Purpose

An internal registry for the operational assets that currently live scattered across chat threads, personal drives, and memory: form links, data sheets, documents, and who is working on what.

Four sections: Forms, Sheets, Documents, Tasks. The first three are a findable index of links and files. The fourth is a lightweight task tracker with an enforced result before completion.

The app spans both companies. Every record except tasks is tagged ByteForce or B-Systems.

---

## 2. Two things to settle before estimating

### 2.1 Decision D-01: do employees log in?

This is the question that determines whether this is a two-week build or a five-week build, and nothing in the request answers it.

The Tasks section says employees enter task results and that a task cannot be completed until they do. That implies employees have accounts and complete their own tasks. But it also says "there will be cards for employees' names" and "I can add as many employees as I want", which describes creating labels, not users.

Two possible systems:

| | **Option A: single user** | **Option B: employee accounts** |
|---|---|---|
| Who logs in | Admin only | Admin plus every employee |
| Employees are | Name labels on cards | Real user accounts |
| Who enters task results | The admin, on their behalf | The employee, themselves |
| Who ticks the checkbox | The admin | The employee |
| Needs | No auth beyond one login | Auth, roles, permissions, per-user scoping, invitations, password reset |
| Rough cost | Baseline | Roughly double |

**Recommendation: Option B.** The result-before-completion rule only means something if the person doing the work is the person recording it. If an admin types results on everyone's behalf, the gate protects nothing and the whole Tasks section is a spreadsheet with extra steps.

**This specification is written for Option B.** If Option A is chosen, delete Section 5, remove all per-user scoping, and the rest stands.

### 2.2 The name

"Database" will make every conversation with a developer ambiguous. "Is that in the database or in Database?" is a real sentence someone will have to say. It also describes the least interesting thing about the app.

Suggestions: **Vault**, **Index**, **Registry**, **Hub**, or **BF Ops**. Cosmetic, and entirely your call, but cheaper to change now than after the repo, the subdomain, and the login page all carry it. See D-02.

### 2.3 Worth saying once

Sections 1 to 3 are a tagged link and file index. Google Drive with a naming convention, or Notion with a database view, does most of that today, and both are already connected. The genuinely custom part is Tasks, specifically the result-gated completion and the automatic late calculation, which neither tool does the way described.

Building all four together is still defensible, because one place your team actually opens beats three places they mean to. But if the timeline is tight, Tasks is the section that earns its build. See D-10.

---

## 3. Users and roles

| Role | Access |
|---|---|
| **Admin** | Everything. Creates and edits all records, manages employees, assigns tasks, sees every task |
| **Employee** | Reads Forms, Sheets, and Documents. Sees own tasks only. Enters results and marks own tasks complete |

Employees do not create forms, sheets, or documents in v1. See D-03 if that changes.

### 3.1 Permission matrix

| Capability | Admin | Employee |
|---|:--:|:--:|
| View Forms, Sheets, Documents | Yes | Yes |
| Add or edit Forms, Sheets, Documents | Yes | No |
| Download or open files | Yes | Yes |
| Archive a record | Yes | No |
| View employee cards | All | Own only |
| Create an employee | Yes | No |
| Create or edit a task | Yes | No |
| Enter a task result | Any task | Own tasks |
| Mark a task complete | Any task | Own tasks |
| Reopen a completed task | Yes | No |
| View late statistics across employees | Yes | No |

---

## 4. Information architecture

```
Database
|
+-- Forms         Table of form links, filterable by company
+-- Sheets        Table of sheet links and uploaded spreadsheets
+-- Documents     Table of uploaded documents, filterable by company and type
+-- Tasks         Employee cards, each holding a task table
```

Global search sits in the header and returns results across all four sections. See Section 10.

---

## 5. Employees and accounts

### 5.1 Entity: Employee

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `id` | UUID | Yes | |
| `user_id` | UUID FK | No | Null until the account is activated |
| `full_name` | String(120) | Yes | The card label |
| `email` | String(160) | Yes | Login identifier, unique |
| `job_title` | String(120) | No | |
| `company` | `company` | No | ByteForce, B-Systems, or both |
| `is_active` | Boolean | Yes | Default true |
| `created_at` / `updated_at` | Timestamp | Yes | |

### 5.2 Account creation

An admin creates the employee. The system issues a single-use invitation link, valid 7 days, sent to the employee's email. The employee clicks it and sets their own password.

Passwords are never generated from a pattern, never displayed, and never stored in readable form. Same rule as every other system in this stack.

### 5.3 Deactivation

Employees are deactivated, never deleted. Their card is hidden from the default view and their completed task history is retained, because the point of recording who did what and whether it was late is that the record survives the person leaving.

---

## 6. Domain model

### 6.1 Enumerations

| Enum | Values |
|---|---|
| `company` | `BYTEFORCE`, `BSYSTEMS` |
| `sheet_type` | `LEADS`, `EMPLOYEES`, `DATA`, `CAMPAIGN_LEADS` |
| `sheet_storage` | `LINK`, `FILE` |
| `document_type` | `CONTRACT`, `PROPOSAL`, `INVOICE`, `REPORT`, `PRESENTATION`, `BRAND_ASSET`, `LEGAL`, `HR`, `OTHER` |
| `task_status` | `OPEN`, `COMPLETED` |
| `attachment_kind` | `FILE`, `LINK` |
| `user_role` | `ADMIN`, `EMPLOYEE` |

The document type list is a proposal. The request said "Contracts, Proposals, etc." and the list needs closing before build, because it drives the filter. See D-04.

### 6.2 Entity: Form

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `id` | UUID | Yes | |
| `name` | String(160) | Yes | |
| `url` | String(2048) | Yes | Must be a valid http or https URL |
| `company` | `company` | Yes | |
| `notes` | Text | No | |
| `created_by` | UUID FK | Yes | |
| `created_at` / `updated_at` | Timestamp | Yes | Automatic |
| `is_archived` | Boolean | Yes | Default false |

### 6.3 Entity: Sheet

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `id` | UUID | Yes | |
| `name` | String(160) | Yes | |
| `storage_mode` | `sheet_storage` | Yes | `LINK` or `FILE` |
| `url` | String(2048) | Conditional | Required when mode is `LINK` |
| `file_id` | UUID FK | Conditional | Required when mode is `FILE` |
| `date_created` | Date | Yes | The date the sheet itself was created, entered by the user. Distinct from `created_at` |
| `company` | `company` | Yes | |
| `type` | `sheet_type` | Yes | |
| `last_record_count` | Integer | No | See 6.3.1 |
| `last_record_count_as_of` | Date | No | See 6.3.1 |
| `notes` | Text | No | |
| `created_by` | UUID FK | Yes | |
| `created_at` / `updated_at` | Timestamp | Yes | Automatic |
| `is_archived` | Boolean | Yes | Default false |

#### 6.3.1 On "No. of last recorded result"

Read as: how many records the sheet currently holds. As specified it is a number someone types once and never updates, which means within a month it is wrong on every row and nobody trusts the column.

Two fixes, both cheap:

1. **Store an as-of date alongside it.** A count of 1,240 as of 12 July is useful. A bare 1,240 is not. Required.
2. **When the sheet is an uploaded file, compute it.** Count the populated rows on the first worksheet at upload and refresh it on every replacement. Removes the manual step entirely for uploaded sheets. Recommended.

For linked sheets the count stays manual, because reading a live Google Sheet requires an integration that is out of scope.

### 6.4 Entity: Document

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `id` | UUID | Yes | |
| `name` | String(160) | Yes | |
| `description` | Text | No | The request marks this required. Recommend optional, since forcing a description produces a column of "contract" |
| `company` | `company` | Yes | |
| `type` | `document_type` | Yes | |
| `file_id` | UUID FK | Yes | PDF, DOCX, XLSX |
| `created_by` | UUID FK | Yes | |
| `created_at` / `updated_at` | Timestamp | Yes | Automatic. The request omits a date field here while Sheets has one. Every record gets one automatically |
| `is_archived` | Boolean | Yes | Default false |

### 6.5 Entity: Task

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `id` | UUID | Yes | |
| `employee_id` | UUID FK | Yes | One assignee per task |
| `name` | String(200) | Yes | |
| `description` | Text | No | |
| `company` | `company` | No | See D-05 |
| `deadline` | Date or DateTime | Yes | See D-06 |
| `status` | `task_status` | Yes | Default `OPEN` |
| `result_text` | Text | Conditional | Required to complete unless an attachment exists. See 9.3 |
| `completed_at` | Timestamp | No | Set automatically on completion |
| `was_late` | Boolean | No | Computed at completion. See 9.4 |
| `days_late` | Integer | No | Computed at completion |
| `created_by` | UUID FK | Yes | |
| `created_at` | Timestamp | Yes | Automatic. This is the Creation Date column |
| `updated_at` | Timestamp | Yes | |
| `is_archived` | Boolean | Yes | Default false |

### 6.6 Entity: TaskAttachment

The task result accepts text, files, and links. Files and links are a child table since there may be several of each.

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `id` | UUID | Yes | |
| `task_id` | UUID FK | Yes | |
| `kind` | `attachment_kind` | Yes | `FILE` or `LINK` |
| `file_id` | UUID FK | Conditional | When kind is `FILE` |
| `url` | String(2048) | Conditional | When kind is `LINK` |
| `label` | String(160) | No | |
| `added_by` | UUID FK | Yes | |
| `created_at` | Timestamp | Yes | |

### 6.7 Entity: StoredFile

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `original_filename` | String(255) | Sanitised on storage |
| `storage_key` | String(512) | Non-guessable, non-sequential |
| `mime_type` | String(100) | Validated against file content, not extension |
| `size_bytes` | Integer | |
| `uploaded_by` | UUID FK | |
| `version` | Integer | Increments on replacement |
| `uploaded_at` | Timestamp | |

### 6.8 Entity: ActivityLog

Append-only. Records creation, edits, archival, task completion, and task reopening, with actor and timestamp. Lighter than the CRM audit log, but the late-completion record is a performance record about a named person, and performance records need provenance.

---

## 7. Module F: Forms

| ID | Requirement | Priority |
|---|---|:--:|
| FR-F01 | Table listing all forms with name, company, notes, date added, and a link control. | Must |
| FR-F02 | Add form with name, URL, company, and optional notes. | Must |
| FR-F03 | URL validated as a well-formed http or https address on save. | Must |
| FR-F04 | Clicking a row's link opens the form in a new tab. | Must |
| FR-F05 | Edit and archive any form. Admin only. | Must |
| FR-F06 | Filter by company. Sort by name and date added. | Must |
| FR-F07 | Free-text search across name and notes. | Must |
| FR-F08 | Warn on save when the same URL already exists on another form. | Should |

---

## 8. Modules S and D: Sheets and Documents

### 8.1 Sheets

| ID | Requirement | Priority |
|---|---|:--:|
| FR-S01 | Table listing name, type, company, date created, record count with its as-of date, notes, and an open control. | Must |
| FR-S02 | Add sheet, choosing link or file upload. Exactly one of the two is supplied. | Must |
| FR-S03 | File upload accepting XLSX, XLS, and CSV, maximum 25 MB. | Must |
| FR-S04 | Linked sheets open in a new tab. Uploaded sheets download via a signed URL. | Must |
| FR-S05 | Record count for uploaded sheets computed at upload and on replacement. | Should |
| FR-S06 | Replacing an uploaded file retains the previous version. | Should |
| FR-S07 | Filter by company and type. Sort by name, date created, and record count. | Must |
| FR-S08 | Free-text search across name and notes. | Must |
| FR-S09 | Edit and archive. Admin only. | Must |

### 8.2 Documents

| ID | Requirement | Priority |
|---|---|:--:|
| FR-D01 | Table listing name, type, company, description, date added, and a download control. | Must |
| FR-D02 | Add document with name, company, type, optional description, and a file. | Must |
| FR-D03 | File upload accepting PDF, DOCX, XLSX, maximum 25 MB. | Must |
| FR-D04 | Download via a signed URL valid for 5 minutes. | Must |
| FR-D05 | In-browser preview for PDFs. | Should |
| FR-D06 | Replacing a file retains the previous version. | Should |
| FR-D07 | Filter by company and type. Sort by name and date added. | Must |
| FR-D08 | Free-text search across name and description. | Must |
| FR-D09 | Edit and archive. Admin only. | Must |

---

## 9. Module T: Tasks

### 9.1 Layout

Employee cards, each expanding to a table of that employee's tasks.

| Card face | Content |
|---|---|
| Name | Employee full name |
| Job title | If present |
| Counts | Open tasks, overdue tasks, completed tasks |
| Indicator | Overdue count highlighted when above zero |

Admins see every card. Employees see only their own.

### 9.2 Task table columns

| Column | Behaviour |
|---|---|
| Checkbox | Completes the task. Gated, see 9.3 |
| Task name | |
| Creation date | Automatic, read-only |
| Description | Truncated with expand |
| Result | Text preview plus attachment and link counts |
| Deadline | Highlighted when passed and the task is open |
| Completed on | Empty until completed |
| Late | Blank, On time, or "Late by N days" |

Default sort: open tasks first, by deadline ascending, so the next thing due is at the top.

### 9.3 The completion gate

> A task cannot be marked complete until a result has been entered.

A result is satisfied by any one of: result text, at least one uploaded file, or at least one link. Requiring text even when a document is attached would force people to type "see attached", which teaches everyone the gate is theatre.

**Interaction:** clicking the checkbox on a task with no result opens the result panel rather than showing an error. The panel accepts text, file uploads, and links, and its save action completes the task in the same step. One action, not two.

The checkbox is enabled by the employee who owns the task, and by admins on any task.

### 9.4 On completion

Automatically, in one transaction:

1. `status` becomes `COMPLETED`
2. `completed_at` is stamped from server time, not browser time
3. `was_late` and `days_late` are computed and **stored**, not derived on read

Storing the outcome matters: if an admin later edits the deadline, the recorded lateness must not silently change. What was true at completion stays true.

**Late calculation.** With a date-only deadline, a task is late when it is completed after 23:59:59 on the deadline date, in Africa/Cairo. `days_late` is the number of whole days between the deadline and the completion date. Completing on the deadline day is on time.

If deadlines become datetimes (D-06), late is simply `completed_at > deadline` and `days_late` rounds up to whole days.

### 9.5 Reopening

Admins only. Reopening clears `completed_at`, `was_late`, and `days_late`, returns the status to open, and writes an audit entry recording the previous values. Employees cannot reopen their own completed tasks.

### 9.6 Functional requirements

| ID | Requirement | Priority |
|---|---|:--:|
| FR-T01 | Employee cards, addable by an admin, each expanding to a task table. | Must |
| FR-T02 | Create a task with name, assignee, deadline, and optional description. | Must |
| FR-T03 | Task creation date recorded automatically. | Must |
| FR-T04 | Result panel accepting text, multiple file uploads, and multiple links. | Must |
| FR-T05 | Completion blocked until at least one form of result exists. Enforced server side. | Must |
| FR-T06 | Clicking the checkbox with no result opens the result panel rather than erroring. | Must |
| FR-T07 | Completion date stamped from server time. | Must |
| FR-T08 | Late status and days late computed at completion and stored. | Must |
| FR-T09 | Overdue open tasks visibly flagged in the table and counted on the card. | Must |
| FR-T10 | Employees see only their own card and tasks, enforced at the query layer. | Must |
| FR-T11 | Admin can reopen a completed task. Employees cannot. | Must |
| FR-T12 | Admin can edit or reassign any task. Reassignment is logged. | Must |
| FR-T13 | Filter tasks by status, overdue, and deadline range. | Should |
| FR-T14 | Admin view listing all overdue tasks across all employees in one place. | Should |
| FR-T15 | Email notification to the assignee on task creation and on the deadline day. | Should |
| FR-T16 | Export a task table to XLSX. | Could |

---

## 10. Cross-cutting requirements

### 10.1 Search

A single header search returning results grouped by section, matching on names, notes, and descriptions. Without it this app stops working at about two hundred rows, which is roughly six months in. It is a Must, not a nice-to-have, because findability is the entire premise.

### 10.2 Archival

Nothing is hard deleted. Archived records are hidden from default views, excluded from counts, and restorable by an admin. The interface may say Delete; the behaviour underneath is archival.

### 10.3 File handling

| Requirement | Specification |
|---|---|
| Storage | Private object storage. No public URL at any time |
| Access | Signed URL, 5 minutes, generated per request against the requester's permissions |
| Validation | File type verified by content inspection, not extension |
| Size limits | 25 MB for documents and sheets, 25 MB per task attachment |
| Filenames | Sanitised on storage. Original name retained for display |
| Versioning | Replacing a file retains the previous version |
| Malware scanning | Before a file becomes retrievable |

Lower risk than the partner portal, since every user here is internal. The rules still hold, because contracts and employee data are among the things being stored.

### 10.4 Empty states

Each section needs a designed empty state with its primary action, not a blank table. This app will be empty on day one and half empty for a month.

---

## 11. Validation rules

| ID | Rule |
|---|---|
| BR-01 | Form URL must be a well-formed http or https address. |
| BR-02 | A sheet has exactly one of a URL or an uploaded file, never both and never neither. |
| BR-03 | `last_record_count` requires an as-of date when entered manually. |
| BR-04 | Uploaded files are validated by content inspection. Mismatched files are rejected. |
| BR-05 | A task cannot be completed without result text, a file, or a link. Enforced server side. |
| BR-06 | `completed_at` is set from server time and is not user editable. |
| BR-07 | `was_late` and `days_late` are computed once at completion and stored. Later deadline edits do not alter them. |
| BR-08 | Only an admin can reopen a completed task. |
| BR-09 | Employees can read, write, and complete only tasks assigned to them. Enforced at the query layer. |
| BR-10 | Employees cannot create, edit, or archive forms, sheets, or documents. |
| BR-11 | Nothing is hard deleted. Archival and deactivation only. |
| BR-12 | Passwords are never generated from a pattern, displayed, or stored readable. |
| BR-13 | Deactivating an employee retains all their task history. |
| BR-14 | Files are reachable only through signed URLs valid for 5 minutes. |
| BR-15 | Timestamps stored UTC, displayed Africa/Cairo. |

---

## 12. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Any table loads in under 1.5 seconds at 2,000 rows. |
| NFR-02 | Search returns in under 1 second. |
| NFR-03 | Responsive from 1280 px to 375 px. Tables become stacked cards on mobile. |
| NFR-04 | Latest two versions of Chrome, Edge, Safari, Firefox. |
| NFR-05 | Sized for 50 users, 5,000 records, and 20 GB of files in year one. |
| NFR-06 | Passwords hashed with Argon2id. All traffic over HTTPS. |
| NFR-07 | Authorisation enforced server side on every endpoint. |
| NFR-08 | Daily automated backup including object storage, 30-day retention, tested restore. |
| NFR-09 | Timezone Africa/Cairo for display, UTC for storage. |
| NFR-10 | Interface strings externalised for translation from day one. |
| NFR-11 | Keyboard accessible, visible focus states, WCAG AA contrast. |

---

## 13. Acceptance criteria

**AC-01 Form creation and access**
Given a form is added with a valid URL and company, then it appears in the table, the company filter isolates it, and its link opens in a new tab.

**AC-02 URL validation**
Given a form is submitted with a malformed URL, then it is rejected with a field-level message.

**AC-03 Sheet storage exclusivity**
Given a sheet is submitted with both a URL and a file, or with neither, then it is rejected.

**AC-04 Record count computed**
Given an XLSX is uploaded as a sheet, then the record count is populated from the file's populated row count and the as-of date is set to today.

**AC-05 Document access control**
Given a document is uploaded, when its storage path is requested without authentication, then access is denied. When requested by an authenticated user, a signed URL valid for 5 minutes is issued.

**AC-06 File type validation**
Given a file renamed to .pdf whose content is not a PDF, when uploaded, then it is rejected.

**AC-07 Completion gate**
Given an open task with no result, when the checkbox is clicked, then the result panel opens and the task remains open until a result is saved.

**AC-08 Completion gate, server side**
Given an open task with no result, when a completion request is sent directly to the API, then it is rejected with 422 and the task remains open.

**AC-09 Result by attachment alone**
Given an open task, when a PDF is uploaded as the result with no text entered, then completion succeeds.

**AC-10 Late calculation**
Given a task with a deadline of 10 August completed on 13 August in Africa/Cairo, then it is recorded late with days late of 3.

**AC-11 On-time boundary**
Given a task with a deadline of 10 August completed at 23:30 on 10 August, then it is recorded on time.

**AC-12 Lateness is frozen**
Given a task completed late by 3 days, when an admin subsequently changes the deadline, then the stored late status and days late are unchanged.

**AC-13 Employee scoping**
Given an employee is authenticated, when the Tasks section loads, then only their own card and tasks appear in the response payload, and a direct API request for another employee's task returns 403.

**AC-14 Employee cannot reopen**
Given an employee has completed a task, when they attempt to reopen it, then the action is unavailable and a direct API request returns 403.

**AC-15 Archival**
Given any record is deleted by an admin, then it disappears from all views and counts and remains restorable.

**AC-16 Deactivation preserves history**
Given an employee with completed tasks is deactivated, then their card is hidden from the default view and their task history including late records is retained.

**AC-17 Global search**
Given records exist in all four sections matching a term, when the term is searched, then results are returned grouped by section.

---

## 14. In scope

- Four sections: Forms, Sheets, Documents, Tasks
- Two roles with server-enforced permissions
- Admin-created employees with invitation-link account activation
- Forms: link registry with company tagging, filtering, search
- Sheets: link or file, typed, with record count and as-of date, computed for uploads
- Documents: typed file registry with description, preview, and versioning
- Tasks: employee cards, task tables, result-gated completion, automatic completion date, stored late calculation
- Task results accepting text, multiple files, and multiple links
- Overdue flagging and an admin overdue view
- Global search across all sections
- Private file storage with signed URL access and content validation
- Archival everywhere, hard deletion nowhere
- Activity logging
- Responsive web application

---

## 15. Out of scope

- Google Drive, Sheets, or Notion integration, including reading live row counts from linked sheets
- In-app spreadsheet or document editing. Files are stored and served, not edited
- Automatic dead-link detection on stored URLs
- Form building. The app stores links to forms built elsewhere
- Task comments, threads, or discussion
- Subtasks, dependencies, or checklists within a task
- Recurring or scheduled tasks
- Multiple assignees per task
- Task priorities, labels, or custom fields
- Time tracking or effort estimation
- Gantt, calendar, or board views of tasks
- Approval workflows on task completion
- Employee performance scoring or reporting beyond raw late counts
- Native mobile apps
- Offline mode
- Public or client-facing access of any kind
- Full-text search inside stored file contents. Search covers metadata only
- OCR
- Bulk import of existing forms, sheets, or documents
- Notifications beyond in-app and email
- Two-factor authentication
- Second interface language, though strings are externalised

---

## 16. Open decisions

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| D-01 | Do employees log in and complete their own tasks, or is this single-user with employees as labels? | Employee accounts. The result gate is meaningless if an admin fills it in for them. **Answer before estimating; it roughly doubles the build.** | Everything |
| D-02 | Keep the name Database? | Rename. It collides with the word every developer uses daily. | Cosmetic, but decide early |
| D-03 | Can employees add forms, sheets, or documents, or only read them? | Read only in v1. Easy to open up later, hard to clean up after. | Section 3 |
| D-04 | Close the document type list. | Adopt the list in 6.1, amended to your actual categories. It drives the filter, so it cannot stay open-ended. | Module D |
| D-05 | Do tasks carry a company tag? | Yes. Everything else does, and your team works across both. | Module T |
| D-06 | Is a deadline a date or a date and time? | Date only. Time-of-day deadlines on internal tasks create false lateness and arguments about what 5pm meant. | Section 9.4 |
| D-07 | Is description on a document genuinely required? | Make it optional. A required description produces a column of one-word entries. | Module D |
| D-08 | Can employees see each other's tasks and results? | No in v1. If the intent is shared visibility of workload, that is a different design and should be decided deliberately. | Module T |
| D-09 | What is the storage budget and per-file limit? | 25 MB per file, 20 GB total in year one. Confirm against your hosting plan. | Section 10.3 |
| D-10 | Build all four sections, or start with Tasks? | If timeline is tight, Tasks first. Sections 1 to 3 are partially covered by tools you already use; Tasks is not covered at all. | Sequencing |

---

## 17. Estimation notes

Substantially smaller than the CRM systems. Rough ordering of effort:

1. **Tasks.** The only section with real logic: the completion gate, the attachment model, the late computation, per-employee scoping, and reopening
2. **Auth and roles.** Only if D-01 resolves to employee accounts, in which case this is the second largest item
3. **File handling.** Upload, validation, private storage, signed URLs, versioning. Shared across Sheets, Documents, and task attachments, so build it once
4. **Forms, Sheets, Documents.** Three variations on a filtered table with a create form. The third is much faster than the first
5. **Search.** Straightforward across metadata. Do not let it drift into file-content indexing, which is a different project

**Build the file handling module first.** Three sections depend on it, and it is the piece most likely to need rework if it is improvised per section.

---

*End of specification. Version 1.0.*
