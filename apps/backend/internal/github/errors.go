package github

import (
	"errors"
	"strings"
)

// ErrInvalidPRURL signals that a caller-supplied PR URL could not be parsed.
// Used by AssociateExistingPRByURL so HTTP callers can translate the failure
// into a 400 instead of a generic 500.
var ErrInvalidPRURL = errors.New("invalid PR URL")

// ErrTaskNotFound is the sentinel cleanup paths check for to distinguish
// "the task is already gone — fine, mop up the dedup row" from a real
// upstream failure. Adapter implementations of TaskDeleter wrap this when
// the task domain reports a missing row so the github layer can recognize
// the case without string-matching the underlying error message.
var ErrTaskNotFound = errors.New("github: task not found for cleanup")

// ErrSelfApprove is returned by SubmitReview when the authenticated user
// attempts to APPROVE their own PR. GitHub rejects this with a 422; we
// catch it server-side so the UI sees a clean, typed error rather than a
// generic upstream failure when the frontend's visibility guard is bypassed.
var ErrSelfApprove = errors.New("cannot approve your own pull request")

// isTaskNotFound recognizes both the typed sentinel and the legacy
// "not found" substring used by older adapters that haven't migrated yet.
// String matching stays as a fallback so this PR doesn't regress installs
// where the adapter wasn't updated in lockstep.
func isTaskNotFound(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrTaskNotFound) {
		return true
	}
	return strings.Contains(err.Error(), "not found")
}
