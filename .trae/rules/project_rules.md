`1. Do not make any changes until you have 95% confidence that you know what to build. Ask me follow-up questions until you have that confidence.
2. Add function-level comments when generating code.
3. Don't confirm the feature works without 100% testing and full app testing.
4. Always test runtime errors for ui and make sure the ui is not broken.
5.	Minimize Assumptions:
	•	Do not assume implicit business logic or schema structure. Confirm all ambiguous fields, models, or flows with the user.
	6.	UI/UX Consistency:
	•	Ensure any new UI components or layouts match the existing design system (CSS framework, component library, spacing, naming conventions).
	•	Reuse shared components when possible.
	7.	State Management Accuracy:
	•	Respect existing global state architecture (Redux, Zustand, Context, etc.). Do not introduce redundant state or duplicate fetch logic.
	8.	Avoid Silent Failures:
	•	Always handle and report errors (network, parsing, empty results) visibly in the UI and logs — never fail silently.
	9.	Database Safety:
	•	When generating queries or schema changes, ensure idempotence and backward compatibility. Never drop or overwrite user-critical data or indexes without confirmation.
	10.	Comment Any Non-Trivial Logic:

	•	For anything that’s not 100% self-explanatory, add inline comments, not just function-level.

	11.	Adhere to Existing Folder Structure & Naming Conventions:

	•	Use the same style of naming files, functions, variables as seen in the project (snake_case, camelCase, PascalCase).
	•	Place files in correct modules or domain folders.

	12.	Minimal Diff Principle:

	•	Only touch the minimum required lines of code. Do not reformat entire files or inject unrelated changes.

	13.	All External Libraries Must Be Justified:

	•	Do not introduce new dependencies unless absolutely necessary — and only after checking whether the functionality exists in the current stack.

	14.	Avoid Hardcoding Configs or URLs:

	•	Use environment variables or config files. No magic strings, keys, or URLs.

	15.	No Broken Tests Allowed:

	•	Ensure that existing tests pass, and add/update unit/integration tests when features or logic are added.

	16.	Accessibility (A11y):

	•	Ensure new UI elements follow accessibility best practices (keyboard nav, alt text, color contrast, ARIA labels where needed).