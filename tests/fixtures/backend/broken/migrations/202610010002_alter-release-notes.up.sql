-- The later definition wins: notes is now 10001 in the database and 10000 everywhere else.
ALTER TABLE release DROP CONSTRAINT release_notes_ck;
ALTER TABLE release ADD CONSTRAINT release_notes_ck CHECK (char_length(notes) <= 10001);
