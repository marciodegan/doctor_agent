# Security Specification: Doctor Provider Mappings

## Data Invariants
- A DoctorProviderMapping must always belong to a team (`teamId`).
- A DoctorProviderMapping must have a valid `doctorId`, `doctorName`, `executante`, and `prestador`.
- An association is only valid if `teamId` is a valid group where the user is a member (for read) or owner (for write).

## "Dirty Dozen" Payloads (Examples of invalid writes)
1. Missing `teamId`.
2. Missing `doctorId`.
3. Missing `executante`.
4. Missing `prestador`.
5. `active` set to non-boolean.
6. Attempting to write a mapping for a team the user does not own.
7. Attempting to write with an invalid ID format.
8. Injection in `executante` (e.g., long string).
9. Injection in `prestador`.
10. Attempting to modify `teamId` in an update.
11. Attempting to modify `doctorId` in an update.
12. Attempting to create with an invalid `createdAt` timestamp (not `request.time`).

## Security Rules
```
    match /doctor_provider_mappings/{mappingId} {
      allow read: if isSignedIn() && isMember(resource.data.teamId);
      allow create: if isSignedIn() && isOwner(incoming().teamId) && 
                       incoming().createdAt == request.time &&
                       isValidId(mappingId);
      allow update: if isSignedIn() && isOwner(existing().teamId) &&
                       incoming().teamId == existing().teamId &&
                       incoming().doctorId == existing().doctorId &&
                       incoming().updatedAt == request.time;
      allow delete: if isSignedIn() && isOwner(existing().teamId);
    }
```
