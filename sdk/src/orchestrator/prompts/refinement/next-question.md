<follow_up>
Reassess scope, affected PBIs and unresolved decisions using the latest answers.
For this call, override the initial discovery quota and return an array with only
the single next material question, or [] when discovery can end. Reconsider
every pending question. Drop questions made irrelevant by an answer, and ask
about a newly exposed gap if it matters more. Do not repeat answered, deferred,
or unknown decisions. Preserve a pending question's ID if it still applies, and
use an unused positive numeric ID for a new question.
Remaining capacity: {{remainingBusiness}} business questions and {{remainingSetup}} setup questions.
<answers>
{{evidence}}
</answers>
<pending_questions>
{{pending}}
</pending_questions>
</follow_up>
