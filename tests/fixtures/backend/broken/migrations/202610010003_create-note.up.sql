CREATE TYPE note_kind AS ENUM ('plain', 'pinned');

CREATE TABLE note (
    id uuid PRIMARY KEY,
    release_id uuid NOT NULL REFERENCES release (id),
    body text NOT NULL,
    created timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT note_body_check CHECK (char_length(body) <= 5000)
);

CREATE UNIQUE INDEX note_release_id_uq ON note (release_id, id);
CREATE INDEX notes_by_release ON note (release_id);
