# Firebase Security Specification & TDD Spec

This document details the security specification, validation constraints, and Red Team threat model for the Noa Ituran Firebase database structure.

## 1. Core Data Invariants

1. **Owner/Auth Integrity**: No user may spoof status data representing another driver's vehicle.
2. **Schema Integrity**: Documents in `fleet` and `alerts` must strictly match the validated `VehicleState` and `Alert` schemas, preventing injection of malicious payloads.
3. **Immutability of Key Identifiers**: Document IDs must be strictly verified and bounded to prevent excessive string sizes or path-poisoning.
4. **Verified Write Gate**: Public reads are permitted for live location widgets, but all writes must stem from authenticated accounts with verified emails (or webhook origins).

---

## 2. The "Dirty Dozen" Threat Payloads

The following 12 malicious payloads attempt to break the security policies:

### Payload 1: Vehicle Spoofing (Identity Theft)
*   **Target**: `/fleet/hikmat`
*   **Attack Vector**: Authenticated user "ali" attempts to override "hikmat"'s vehicle properties.
*   **Payload**: `{ "id": "hikmat", "driver": "حכמת", "latitude": 32.0, "longitude": 34.0, "lastUpdated": "2026-05-25T00:00:00Z" }` (written by `auth.uid = "ali"`)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 2: Massive Latitude Overflow (Resource Exhaustion)
*   **Target**: `/fleet/hikmat`
*   **Attack Vector**: Injection of invalid coordinate types.
*   **Payload**: `{ "id": "hikmat", "driver": "חכמת", "latitude": "not-a-number", "longitude": 34.0 }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 3: Shadow Field Injection (Anti-Update-Gap)
*   **Target**: `/fleet/ali`
*   **Attack Vector**: Appending an un-validated administration flag to bypass webhook verification.
*   **Payload**: `{ "id": "ali", "driver": "עלי", "latitude": 32.1, "longitude": 34.8, "adminPrivilege": true }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 4: Invalid Identifier Poisoning
*   **Target**: `/fleet/invalid#@%characters`
*   **Attack Vector**: Resource poisoning via non-alphanumeric collection ID keys.
*   **Payload**: `{ "id": "invalid#@%characters", "driver": "Unknown" }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 5: Deny-of-Wallet Array Abuse
*   **Target**: `/alerts/test_alert`
*   **Attack Vector**: Injecting massive unbounded properties or lists.
*   **Payload**: `{ "timestamp": "now", "driver": "עלי", "type": "location_update", "message": "A".repeat(5000) }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 6: Unverified Email Write
*   **Target**: `/fleet/hikmat`
*   **Attack Vector**: Attempting writes using an account with `email_verified == false` to bypass webhook restriction.
*   **Payload**: `{ "id": "hikmat", "driver": "חכמת", "latitude": 32.1, "longitude": 34.7 }` (written with invalid email state)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 7: Status Shortcutting
*   **Target**: `/alerts/critical_pto`
*   **Attack Vector**: Forcing critical PTO alerts to normal location logs to mask operational theft.
*   **Payload**: `{ "timestamp": "now", "driver": "עלי", "type": "location_update", "message": "CRITICAL PTO OPEN" }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 8: Null-Value ID Spoofing
*   **Target**: `/fleet/ali`
*   **Attack Vector**: Write document with null coordinates and null date to crash geographic queries.
*   **Payload**: `{ "id": "ali", "driver": "עלי", "latitude": null, "longitude": null }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 9: Sibling Write Tampering
*   **Target**: `/alerts/new_alert`
*   **Attack Vector**: Write alerts directly without a corresponding state transition update.
*   **Payload**: `{ "timestamp": "now", "vehicle": "Mercedes", "driver": "חכמת", "type": "pto_alert", "message": "Exploit" }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 10: Terminal State Tampering
*   **Target**: `/fleet/hikmat`
*   **Attack Vector**: Modifying standard fields to inject malicious markup code (XSS injection).
*   **Payload**: `{ "id": "hikmat", "driver": "<script>alert('hack')</script>", "latitude": 32.0, "longitude": 34.0 }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 11: Anonymously Signed Write
*   **Target**: `/fleet/ali`
*   **Attack Vector**: Anonymous authentication token write attempt.
*   **Payload**: `{ "id": "ali", "latitude": 32.1, "longitude": 34.8 }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 12: Relational Orphan Check
*   **Target**: `/alerts/bad_id`
*   **Attack Vector**: Write alert representing a non-existent vehicle ID.
*   **Payload**: `{ "timestamp": "now", "vehicle": "Mystery Plane", "driver": "Bob", "type": "critical", "message": "Mystery" }`
*   **Expected Result**: `PERMISSION_DENIED`

---

## 3. Test Runner Design (`firestore.rules.test.ts`)

```typescript
import { assertFails, assertSucceeds, initializeTestApp } from "@firebase/rules-unit-testing";

describe("Noa Ituran Security Rules Rules", () => {
  it("blocks unauthenticated writes to live fleet tracking", async () => {
    const db = initializeTestApp({ projectId: "saban-ai-drive" }).firestore();
    const docRef = db.collection("fleet").doc("hikmat");
    await assertFails(docRef.set({ latitude: 32, longitude: 34 }));
  });

  it("blocks non-existent or massive ID paths", async () => {
    const db = initializeTestApp({ projectId: "saban-ai-drive" }).firestore();
    const docRef = db.collection("fleet").doc("a".repeat(150));
    await assertFails(docRef.get());
  });
});
```
