-- CPF passa a ser salvo só com os 11 dígitos (RF001); remove a máscara dos registros existentes
UPDATE "users" SET "cpf" = regexp_replace("cpf", '\D', '', 'g') WHERE "cpf" IS NOT NULL;
UPDATE "dependents" SET "cpf" = regexp_replace("cpf", '\D', '', 'g') WHERE "cpf" IS NOT NULL;
