# Module Security

Sync Engine loads modules by importing the module JavaScript files at runtime, which is a kind of dynamic code execution.

Since Sync Engine can sync all files, an attacker could corrupt user's Sync Engine settings at remote side and adding a malicious module. When users sync, the malicious module will be downloaded and executed.

To prevent attacks like this, **symmetric module signing** mechanism is invented.

## Threat Model

This mechanism:

- assumes client devices share the same signing key. So no asymmetric encryption or credential sharing needed.
- trusts transmission layer that ensures module integrity.
- should prevent arbitrary module downloading and execution as well as module source editing.
- trusts official module source (this repo).
- guards module execution by explicit or implicit user approval.
