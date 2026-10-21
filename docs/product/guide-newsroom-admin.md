# Guide for Newsroom Admins

A newsroom admin (مدير الغرفة) runs the newsroom in Isnad: people, desks, rules, private sources, and usage. Admins can also do everything an editor does ([guide-editor.md](guide-editor.md)). The admin pages are under **Newsroom admin** («إدارة الغرفة») in the sidebar.

## Members and roles

**Members and roles** («الأعضاء والأدوار»):

- **Invite a member** («دعوة عضو»): email, name, role (journalist, editor or admin) and desk. The person gets an email with a link valid for 14 days. A new person sets a password on the invitation page; someone with an account signs in and accepts. The invitation only works for the invited address.
- **Pending invitations**: resend (a new link; the old one stops working) or revoke.
- **Members**: change a member's role or desk, deactivate or reactivate them. A deactivated member loses access to the newsroom at once. The newsroom must always keep at least one active admin, so the last admin can't be demoted or deactivated.
- **Desks** («الأقسام»): add, rename or delete desks. Desks organize checks and route review requests.

Who sees what is explained in [roles-and-permissions.md](roles-and-permissions.md).

## Policies

**Policies** («السياسات»):

| Setting | Arabic | Effect |
|---|---|---|
| Default visibility for new checks | من يرى التحققات الجديدة افتراضياً | Preselected in the new-check form; the creator can change it per check |
| Media retention | مدة الاحتفاظ بالمقاطع | Uploaded clips are deleted after this many days; results, transcripts and decisions stay |
| Newsroom name in the isnad note | شعار الغرفة في ملاحظة الإسناد | Adds the branding line to the isnad note |
| Receive content through Telegram | استقبال المحتوى عبر تيليجرام | Whether members may send content from Telegram |
| Differences need an editor's approval | كل نتيجة «مختلف عن المصدر» تتطلب اعتماد محرر | Stored setting (see note) |
| Escalate when the verifier objects | إحالة تلقائية عند اعتراض المدقق الآلي | Stored setting (see note) |

The monthly check limit is shown here but set by the Isnad team.

Note: in the current version every number needs a decision before a check can be approved, and numbers the verifier objects to are always flagged and left out of "approve all matches", whatever these two switches say.

## Private sources

**Private sources** («المصادر الخاصة») are sources only your newsroom sees (for example, a partner's data). Add, edit, pause or delete them. When Isnad searches official sources for your newsroom's numbers, it also searches your private sources' domains, and what it finds there stays private to your newsroom. (Uploading documents to a private source isn't available yet.)

**Propose to the shared registry** («اقتراح للسجل العام») sends a source to the Isnad team. If accepted, it becomes part of the shared registry for every newsroom. While a proposal is pending (or after it's rejected) the source isn't used in searches.

## Activity and usage

**Activity and usage** («النشاط والاستخدام») shows who did what (checks created, decisions, invitations, policy changes) with filters, this month's checks against the limit, and model usage and cost. **Export log** («تصدير السجل») downloads the latest 500 entries as CSV.
