-- Verified backup chunks are binary pieces of existing private files.
update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'application/octet-stream') where id='owner-op-private' and allowed_mime_types is not null and not ('application/octet-stream'=any(allowed_mime_types));

