-- Romanised (Latin-script) version of the simplified message, for TV voices that
-- can't speak Devanagari (the tested Fire TV has no hi-IN TTS voice, see FL-3).
alter table messages add column if not exists tts_text text;
