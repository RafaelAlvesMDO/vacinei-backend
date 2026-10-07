import { PrismaClient, UserRole, TargetAudience } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados VACINEI!?...');

  // 1. Limpeza prévia segura (em ordem reversa de dependência)
  console.log('🧹 Limpando dados existentes...');
  await prisma.notification.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.passwordResetCode.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.vaccinationRecord.deleteMany();
  await prisma.dependent.deleteMany();
  await prisma.professionalRegistry.deleteMany();
  await prisma.campaignVaccine.deleteMany();
  await prisma.campaignUbs.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.dose.deleteMany();
  await prisma.vaccine.deleteMany();
  await prisma.ubs.deleteMany();
  await prisma.user.deleteMany();

  const defaultPasswordHash = await bcrypt.hash('123456', 8);

  // 2. Criação dos Usuários de Teste (RBAC)
  console.log('👤 Criando usuários de teste...');
  const admin = await prisma.user.create({
    data: {
      name: 'Administrador do Sistema',
      email: 'admin@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      cpf: '000.000.000-00',
      phone: '(82) 99999-0001',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const professional = await prisma.user.create({
    data: {
      name: 'Enf. Mariana Costa',
      email: 'mariana.costa@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      cpf: '111.111.111-11',
      phone: '(82) 99999-0002',
      role: UserRole.PROFISSIONAL_SAUDE,
      isActive: true,
      professionalRegistry: {
        create: {
          council: 'COREN',
          registryNumber: '123456',
          uf: 'AL',
          isVerified: true,
          verifiedAt: new Date(),
        },
      },
    },
  });

  const citizen = await prisma.user.create({
    data: {
      name: 'Carlos Eduardo Souza',
      email: 'carlos.souza@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      cpf: '222.222.222-22',
      phone: '(82) 99999-0003',
      birthDate: new Date('1992-05-14'),
      role: UserRole.CIDADAO,
      isActive: true,
      dependents: {
        create: [
          {
            name: 'Enzo Gabriel Souza',
            birthDate: new Date('2024-03-15'),
            cpf: '333.333.333-33',
            relationship: 'FILHO',
            gender: 'M',
          },
          {
            name: 'Valentina Souza',
            birthDate: new Date('2021-08-20'),
            cpf: '444.444.444-44',
            relationship: 'FILHA',
            gender: 'F',
          },
        ],
      },
    },
  });

  console.log(`✅ Usuários criados: Admin (${admin.email}), Profissional (${professional.email}), Cidadão (${citizen.email})`);

  // 3. Unidades Básicas de Saúde (Maceió / AL - Contexto CESMAC)
  console.log('🏥 Criando Unidades Básicas de Saúde (UBSs)...');
  const ubssData = [
    {
      cnes: '2005481',
      name: 'UBS José Araújo Silva',
      address: 'Rua Coronel Paranhos, s/n',
      neighborhood: 'Jacintinho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57041-000',
      latitude: -9.6412,
      longitude: -35.7225,
      phone: '(82) 3315-5001',
      openingHours: '07:00 às 17:00',
    },
    {
      cnes: '2005490',
      name: 'UBS Roland Simon',
      address: 'Rua Cabo Reis, s/n',
      neighborhood: 'Vergel do Lago',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57014-000',
      latitude: -9.6698,
      longitude: -35.7482,
      phone: '(82) 3315-5002',
      openingHours: '07:00 às 17:00',
    },
    {
      cnes: '2005504',
      name: 'UBS Pitanguinha',
      address: 'Avenida Fernandes Lima, 1200',
      neighborhood: 'Pitanguinha',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57052-400',
      latitude: -9.6385,
      longitude: -35.7360,
      phone: '(82) 3315-5003',
      openingHours: '07:00 às 18:00',
    },
    {
      cnes: '2005512',
      name: 'UBS Maria Conceição Fonseca Paranhos',
      address: 'Avenida Comendador Gustavo Paiva, s/n',
      neighborhood: 'Jacarecica',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57038-000',
      latitude: -9.6052,
      longitude: -35.6881,
      phone: '(82) 3315-5004',
      openingHours: '07:00 às 17:00',
    },
    {
      cnes: '2005520',
      name: 'UBS Hamilton Falcão',
      address: 'Avenida Cachoeira do Meirim, s/n',
      neighborhood: 'Benedito Bentes',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57084-000',
      latitude: -9.5601,
      longitude: -35.7389,
      phone: '(82) 3315-5005',
      openingHours: '07:00 às 19:00',
    },
  ];

  for (const ubs of ubssData) {
    await prisma.ubs.create({ data: ubs });
  }
  console.log(`✅ ${ubssData.length} UBSs de Maceió criadas com sucesso.`);

  // 4. Calendário Nacional de Vacinação do SUS (Vacinas e Doses)
  console.log('💉 Cadastrando Vacinas e Doses do Calendário SUS...');
  const vaccinesData = [
    {
      name: 'BCG',
      description: 'Previne as formas graves de tuberculose (miliar e meníngea). Dose única ao nascer.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Tuberculose grave (miliar e meníngea)',
      dosesCount: 1,
      doses: [
        { doseNumber: 1, doseName: 'Dose Única', recommendedAgeMonths: 0, description: 'Aplicada preferencialmente ao nascer na maternidade' },
      ],
    },
    {
      name: 'Hepatite B',
      description: 'Previne a infecção crônica pelo vírus da Hepatite B.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Hepatite B',
      dosesCount: 1,
      doses: [
        { doseNumber: 1, doseName: 'Dose ao Nascer', recommendedAgeMonths: 0, description: 'Aplicada nas primeiras 24 horas de vida' },
      ],
    },
    {
      name: 'Pentavalente (DTP/HB/Hib)',
      description: 'Previne Difteria, Tétano, Coqueluche, Hepatite B e infecções por Haemophilus influenzae tipo b.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Difteria, Tétano, Coqueluche, Hepatite B e Meningite por Hib',
      dosesCount: 3,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose', recommendedAgeMonths: 2, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: '2ª Dose', recommendedAgeMonths: 4, intervalDaysFromPrevious: 60 },
        { doseNumber: 3, doseName: '3ª Dose', recommendedAgeMonths: 6, intervalDaysFromPrevious: 60 },
      ],
    },
    {
      name: 'Poliomielite Inativada (VIP)',
      description: 'Previne a paralisia infantil causada pelos três tipos de poliovírus.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Poliomielite (Paralisia Infantil)',
      dosesCount: 5,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose (VIP)', recommendedAgeMonths: 2, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: '2ª Dose (VIP)', recommendedAgeMonths: 4, intervalDaysFromPrevious: 60 },
        { doseNumber: 3, doseName: '3ª Dose (VIP)', recommendedAgeMonths: 6, intervalDaysFromPrevious: 60 },
        { doseNumber: 4, doseName: '1º Reforço (VOP/VIP)', recommendedAgeMonths: 15, intervalDaysFromPrevious: 270 },
        { doseNumber: 5, doseName: '2º Reforço (VOP/VIP)', recommendedAgeMonths: 48, intervalDaysFromPrevious: 990 },
      ],
    },
    {
      name: 'Pneumocócica 10-Valente',
      description: 'Previne pneumonias, meningites e otites causadas pelos 10 sorotipos mais frequentes de pneumococos.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Pneumonia, Meningite e Otite média por Pneumococo',
      dosesCount: 3,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose', recommendedAgeMonths: 2, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: '2ª Dose', recommendedAgeMonths: 4, intervalDaysFromPrevious: 60 },
        { doseNumber: 3, doseName: 'Reforço', recommendedAgeMonths: 12, intervalDaysFromPrevious: 240 },
      ],
    },
    {
      name: 'Meningocócica C Conjugada',
      description: 'Previne a doença meningocócica invasiva provocada pela Neisseria meningitidis do sorogrupo C.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Meningite Meningocócica do sorogrupo C',
      dosesCount: 3,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose', recommendedAgeMonths: 3, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: '2ª Dose', recommendedAgeMonths: 5, intervalDaysFromPrevious: 60 },
        { doseNumber: 3, doseName: 'Reforço', recommendedAgeMonths: 12, intervalDaysFromPrevious: 210 },
      ],
    },
    {
      name: 'Rotavírus Humano (VRH)',
      description: 'Previne diarreia grave e desidratação associadas ao rotavírus em lactentes.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Gastroenterite por Rotavírus',
      dosesCount: 2,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose', recommendedAgeMonths: 2, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: '2ª Dose', recommendedAgeMonths: 4, intervalDaysFromPrevious: 60 },
      ],
    },
    {
      name: 'Febre Amarela',
      description: 'Previne a febre amarela silvestre e urbana transmitida por mosquitos vetores.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Febre Amarela',
      dosesCount: 2,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose', recommendedAgeMonths: 9, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: 'Reforço', recommendedAgeMonths: 48, intervalDaysFromPrevious: 1170 },
      ],
    },
    {
      name: 'Tríplice Viral (SCR)',
      description: 'Previne sarampo, caxumba e rubéola.',
      targetAudience: TargetAudience.CRIANCA,
      targetDisease: 'Sarampo, Caxumba e Rubéola',
      dosesCount: 2,
      doses: [
        { doseNumber: 1, doseName: '1ª Dose', recommendedAgeMonths: 12, intervalDaysFromPrevious: null },
        { doseNumber: 2, doseName: '2ª Dose (Tetraviral ou SCR + Varicela)', recommendedAgeMonths: 15, intervalDaysFromPrevious: 90 },
      ],
    },
    {
      name: 'HPV Quadrivalente',
      description: 'Previne infecções pelos tipos 6, 11, 16 e 18 do papilomavírus humano, reduzindo risco de câncer de colo de útero e verrugas genitais.',
      targetAudience: TargetAudience.ADOLESCENTE,
      targetDisease: 'Câncer de colo de útero, lesões genitais pré-cancerosas e verrugas anogenitais',
      dosesCount: 1,
      doses: [
        { doseNumber: 1, doseName: 'Dose Única', recommendedAgeMonths: 108, description: 'Meninos e meninas de 9 a 14 anos' },
      ],
    },
    {
      name: 'dTpa (Tríplice Acelular do Adulto)',
      description: 'Previne Difteria, Tétano e Coqueluche em gestantes, transferindo anticorpos protetores ao feto.',
      targetAudience: TargetAudience.GESTANTE,
      targetDisease: 'Coqueluche neonatal, Difteria e Tétano acidental/obstétrico',
      dosesCount: 1,
      doses: [
        { doseNumber: 1, doseName: 'Dose a cada gestação', recommendedAgeMonths: null, description: 'A partir da 20ª semana de gravidez' },
      ],
    },
    {
      name: 'Influenza (Gripe)',
      description: 'Vacina anual trivalente/quadrivalente para proteção contra cepas circulantes de vírus Influenza A e B.',
      targetAudience: TargetAudience.ESPECIAL,
      targetDisease: 'Síndrome Respiratória Aguda por Influenza',
      dosesCount: 1,
      doses: [
        { doseNumber: 1, doseName: 'Dose Anual', recommendedAgeMonths: 6, description: 'Campanha de vacinação anual do SUS' },
      ],
    },
  ];

  for (const vac of vaccinesData) {
    const { doses, ...vacData } = vac;
    await prisma.vaccine.create({
      data: {
        ...vacData,
        doses: {
          create: doses,
        },
      },
    });
  }

  console.log(`✅ ${vaccinesData.length} vacinas e suas respectivas doses inseridas com sucesso.`);
  console.log('🚀 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante execução do seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
