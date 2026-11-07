CREATE TABLE release (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    notes text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT release_id_pk PRIMARY KEY (id),
    CONSTRAINT release_project_id_fk FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE RESTRICT,
    CONSTRAINT release_project_id_name_uq UNIQUE (project_id, name),
    CONSTRAINT release_name_ck CHECK (char_length(name) BETWEEN 1 AND 100),
    CONSTRAINT release_notes_ck CHECK (char_length(notes) <= 10000),
    CONSTRAINT release_status_ck CHECK (status IN ('draft', 'approved', 'released'))
);

CREATE INDEX release_project_id_created_at_idx ON release (project_id, created_at DESC, id);

-- Append-only: rows are never updated.
CREATE TABLE release_event (
    id uuid NOT NULL,
    release_id uuid NOT NULL,
    kind text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT release_event_id_pk PRIMARY KEY (id),
    CONSTRAINT release_event_release_id_fk FOREIGN KEY (release_id) REFERENCES release (id) ON DELETE CASCADE,
    CONSTRAINT release_event_kind_ck CHECK (kind IN ('created', 'approved'))
);
