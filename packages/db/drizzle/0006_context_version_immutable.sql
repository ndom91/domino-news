-- Context explanations are versioned like summaries: new versions only, no edits.
CREATE TRIGGER context_entry_version_immutable BEFORE UPDATE OR DELETE ON context_entry_version
  FOR EACH ROW EXECUTE FUNCTION dn_reject_mutation();
