import { PrismaClient, UserRole, TargetAudience, RecordOrigin, VaccineStatus, ProfessionalCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authConfig } from '../src/config/auth';
import { privacyConfig } from '../src/config/privacy';

const prisma = new PrismaClient();

// Senha padrão de todos os usuários de teste (atende à regra de senha do RF001)
const DEFAULT_PASSWORD = 'Vacinei@2026';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  const date = new Date(Date.now() - days * DAY_IN_MS);
  date.setUTCHours(13, 0, 0, 0);
  return date;
}

// CPF válido e determinístico (só dígitos) a partir de uma base de 9 dígitos
function generateCpf(base: number): string {
  const digits = String(base).padStart(9, '0').split('').map(Number);

  for (const length of [9, 10]) {
    const sum = digits.reduce((acc, digit, i) => acc + digit * (length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }

  return digits.join('');
}

// Perfis de caderneta: dias atrás de cada dose aplicada, em ordem de dose.
// Datas relativas a hoje mantêm o status coerente sempre que o seed roda.
type VaccinationProfile = {
  bornDaysAgo?: number; // bebês: nascimento relativo a hoje
  birthDate?: string; // adultos: data fixa
  vaccines: Record<string, number[]>;
};

const PROFILES: Record<string, VaccinationProfile> = {
  // Bebê de 7 meses com esquema em dia (Penta e Rota completas)
  BEBE_EM_DIA: {
    bornDaysAgo: 210,
    vaccines: {
      BCG: [208],
      'Hepatite B': [208],
      'Pentavalente (DTP/HB/Hib)': [150, 90, 28],
      'Poliomielite Inativada (VIP)': [150, 90, 28],
      'Pneumocócica 10-Valente': [150, 90],
      'Rotavírus Humano (VRH)': [150, 90],
      'Meningocócica C Conjugada': [120, 60],
    },
  },
  // Bebê de 10 meses que tomou só a 1ª dose e não voltou
  BEBE_ATRASADO: {
    bornDaysAgo: 300,
    vaccines: {
      BCG: [298],
      'Hepatite B': [298],
      'Pentavalente (DTP/HB/Hib)': [240],
      'Poliomielite Inativada (VIP)': [240],
      'Rotavírus Humano (VRH)': [240],
      'Pneumocócica 10-Valente': [240],
    },
  },
  // Criança de 14 meses com esquema misto (reforço da Meningo C atrasado)
  CRIANCA_MISTO: {
    bornDaysAgo: 420,
    vaccines: {
      'Pentavalente (DTP/HB/Hib)': [360, 300, 240],
      'Poliomielite Inativada (VIP)': [360, 300, 240],
      'Meningocócica C Conjugada': [330, 270],
      'Febre Amarela': [150],
      'Tríplice Viral (SCR)': [30],
    },
  },
  ADULTO_ATRASADO: {
    birthDate: '1988-03-10',
    vaccines: {
      'Influenza (Gripe)': [200],
      'Febre Amarela': [100],
      'Tríplice Viral (SCR)': [180],
    },
  },
  ADULTO_COMPLETO: {
    birthDate: '1979-11-22',
    vaccines: {
      'Influenza (Gripe)': [45],
      'Hepatite B': [300],
      'Tríplice Viral (SCR)': [330, 220],
    },
  },
  ADOLESCENTE: {
    birthDate: '2013-06-05',
    vaccines: {
      'HPV Quadrivalente': [120],
      'Tríplice Viral (SCR)': [250, 150],
      'Influenza (Gripe)': [60],
    },
  },
  GESTANTE: {
    birthDate: '1996-01-17',
    vaccines: {
      'dTpa (Tríplice Acelular do Adulto)': [70],
      'Influenza (Gripe)': [90],
      'Hepatite B': [160],
    },
  },
  IDOSO: {
    birthDate: '1954-08-30',
    vaccines: {
      'Influenza (Gripe)': [10],
      'Febre Amarela': [330],
    },
  },
};

const CITIZENS: { name: string; profile: keyof typeof PROFILES }[] = [
  { name: 'Ana Beatriz Lima', profile: 'ADULTO_COMPLETO' },
  { name: 'João Pedro Araújo', profile: 'BEBE_EM_DIA' },
  { name: 'Maria Eduarda Santos', profile: 'BEBE_ATRASADO' },
  { name: 'José Antônio Ferreira', profile: 'IDOSO' },
  { name: 'Lúcia Helena Gonçalves', profile: 'GESTANTE' },
  { name: 'Gabriel Cavalcante Melo', profile: 'CRIANCA_MISTO' },
  { name: 'Fernanda Albuquerque', profile: 'ADULTO_ATRASADO' },
  { name: 'Luís Otávio Barbosa', profile: 'ADOLESCENTE' },
  { name: 'Íris Conceição Rocha', profile: 'BEBE_EM_DIA' },
  { name: 'Sebastião Tenório', profile: 'IDOSO' },
  { name: 'Júlia Brandão Vieira', profile: 'BEBE_ATRASADO' },
  { name: 'Rafael Monteiro Lins', profile: 'ADULTO_COMPLETO' },
  { name: 'Cecília Amorim', profile: 'CRIANCA_MISTO' },
  { name: 'Thiago Wanderley', profile: 'ADULTO_ATRASADO' },
  { name: 'Letícia Nascimento', profile: 'GESTANTE' },
  { name: 'Heitor Calheiros', profile: 'BEBE_EM_DIA' },
  { name: 'Valéria Pimentel', profile: 'ADULTO_COMPLETO' },
  { name: 'Mônica Farias Duarte', profile: 'ADOLESCENTE' },
  { name: 'Benedito Assunção', profile: 'IDOSO' },
  { name: 'Lívia Medeiros', profile: 'BEBE_ATRASADO' },
  { name: 'Davi Lúcio Correia', profile: 'CRIANCA_MISTO' },
  { name: 'Patrícia Gusmão', profile: 'ADULTO_ATRASADO' },
  { name: 'Otávio Sarmento', profile: 'ADULTO_COMPLETO' },
  { name: 'Alícia Vasconcelos', profile: 'ADOLESCENTE' },
  { name: 'Renê Torres Falcão', profile: 'GESTANTE' },
];

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

  const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, authConfig.bcryptSaltRounds);
  // Todos os usuários do seed já aceitaram a Política de Privacidade (D26)
  const privacyConsent = { privacyConsentAt: new Date(), privacyPolicyVersion: privacyConfig.policyVersion };

  // 2. Criação dos Usuários de Teste (RBAC)
  console.log('👤 Criando usuários de teste...');
  const admin = await prisma.user.create({
    data: {
      name: 'Administrador do Sistema',
      email: 'admin@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      ...privacyConsent,
      cpf: generateCpf(100000001),
      phone: '82999990001',
      birthDate: new Date('1985-09-02'),
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const professional = await prisma.user.create({
    data: {
      name: 'Enf. Mariana Costa',
      email: 'mariana.costa@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      ...privacyConsent,
      cpf: generateCpf(100000002),
      phone: '82999990002',
      birthDate: new Date('1990-03-10'),
      role: UserRole.PROFISSIONAL_SAUDE,
      isActive: true,
      professionalRegistry: {
        create: {
          category: ProfessionalCategory.ENFERMEIRO,
          council: 'COREN',
          registryNumber: '123456',
          uf: 'AL',
          isVerified: true,
          verifiedAt: new Date(),
          verifiedById: admin.id,
        },
      },
    },
  });

  const citizen = await prisma.user.create({
    data: {
      name: 'Carlos Eduardo Souza',
      email: 'carlos.souza@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      ...privacyConsent,
      cpf: generateCpf(100000003),
      phone: '82999990003',
      birthDate: new Date('1992-05-14'),
      role: UserRole.CIDADAO,
      isActive: true,
      dependents: {
        create: [
          {
            name: 'Enzo Gabriel Souza',
            birthDate: new Date('2024-03-15'),
            cpf: generateCpf(200000001),
            relationship: 'FILHO',
            gender: 'M',
          },
          {
            name: 'Valentina Souza',
            birthDate: new Date('2021-08-20'),
            cpf: generateCpf(200000002),
            relationship: 'FILHA',
            gender: 'F',
          },
        ],
      },
    },
  });

  // Profissional com registro ainda não verificado (para testar o 403 do RF010)
  const unverifiedProfessional = await prisma.user.create({
    data: {
      name: 'Téc. Paulo Ribeiro',
      email: 'paulo.ribeiro@vacinei.com.br',
      passwordHash: defaultPasswordHash,
      ...privacyConsent,
      cpf: generateCpf(100000004),
      phone: '82999990004',
      birthDate: new Date('1995-07-22'),
      role: UserRole.PROFISSIONAL_SAUDE,
      isActive: true,
      professionalRegistry: {
        create: {
          category: ProfessionalCategory.TECNICO_ENFERMAGEM,
          council: 'COREN',
          registryNumber: '654321',
          uf: 'AL',
          isVerified: false,
        },
      },
    },
  });

  console.log(
    `✅ Usuários criados: Admin (${admin.email}), Profissionais (${professional.email}, ${unverifiedProfessional.email}), Cidadão (${citizen.email})`,
  );

  // 3. Unidades Básicas de Saúde (Maceió / AL - Rede Municipal e Distritos Sanitários)
  console.log('🏥 Criando Unidades Básicas de Saúde (UBSs)...');
  const ubssData = [
    // --- 1º Distrito Sanitário (Centro / Orla Sul) ---
    {
      cnes: '2009803',
      name: 'PAM Salgadinho (Sede de Especialidades)',
      address: 'Rua Mizael Domingues',
      number: '241',
      neighborhood: 'Centro',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57020-600',
      latitude: -9.6631,
      longitude: -35.7314,
      phone: '(82) 3312-5460',
      openingHours: 'Seg a Sex: 07:00 às 19:00',
    },
    {
      cnes: '2011603',
      name: 'UBS Dr. Osvaldo Brandão Vilela',
      address: 'Rua Lafaiete Pacheco',
      number: 's/n',
      neighborhood: 'Ponta da Terra',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57021-360',
      latitude: -9.6692,
      longitude: -35.7145,
      phone: '(82) 3312-5498',
      openingHours: 'Seg a Sex: 07:00 às 21:00',
    },
    {
      cnes: '2009706',
      name: 'USF Reginaldo',
      address: 'Rua Doutor Carlos Miranda',
      number: '96',
      neighborhood: 'Poço',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57025-505',
      latitude: -9.6521,
      longitude: -35.7230,
      phone: '(82) 3312-5497',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 2º Distrito Sanitário (Região Lagunar / Sul) ---
    {
      cnes: '2009757',
      name: 'UBS Roland Simon (PAM Vergel)',
      address: 'Rua Cabo Reis',
      number: 's/n',
      neighborhood: 'Vergel do Lago',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57014-000',
      latitude: -9.6698,
      longitude: -35.7482,
      phone: '(82) 3315-5002',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009838',
      name: 'USF Dr. Tarcísio Palmeira',
      address: 'Avenida Alípio Barbosa da Silva',
      number: 's/n',
      neighborhood: 'Pontal da Barra',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57010-820',
      latitude: -9.6912,
      longitude: -35.7725,
      phone: '(82) 3312-5508',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009870',
      name: 'USF Prof. Durval Cortez',
      address: 'Rua Doutor Dionísio Lopes',
      number: '10',
      neighborhood: 'Prado',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57010-210',
      latitude: -9.6625,
      longitude: -35.7510,
      phone: '(82) 3312-5501',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009811',
      name: 'UBS PAM Dique Estrada',
      address: 'Rua das Flores, Conjunto Joaquim Leão',
      number: 's/n',
      neighborhood: 'Ponta Grossa',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57014-430',
      latitude: -9.6734,
      longitude: -35.7523,
      phone: '(82) 3312-5502',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005473',
      name: 'USF José Guedes de Farias',
      address: 'Rua Santa Maria',
      number: 's/n',
      neighborhood: 'Trapiche da Barra',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57010-440',
      latitude: -9.6782,
      longitude: -35.7610,
      phone: '(82) 3312-5505',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 3º Distrito Sanitário (Farol / Eixo Fernandes Lima) ---
    {
      cnes: '2005808',
      name: 'UBS Pitanguinha (USF Vale do Pitanguinha)',
      address: 'Rua Antônio Nogueira',
      number: 's/n',
      neighborhood: 'Pitanguinha',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57052-400',
      latitude: -9.6385,
      longitude: -35.7360,
      phone: '(82) 3315-5003',
      openingHours: 'Seg a Sex: 07:00 às 18:00',
    },
    {
      cnes: '2003325',
      name: 'UBS Dr. Aliomar Almeida Lins',
      address: 'Rua Goiás',
      number: '140',
      neighborhood: 'Farol',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57051-240',
      latitude: -9.6450,
      longitude: -35.7395,
      phone: '(82) 3312-5515',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '9306471',
      name: 'UBS Maria Tereza Holanda Costa',
      address: 'Rua Padre Cícero',
      number: '224',
      neighborhood: 'Ouro Preto',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57045-660',
      latitude: -9.6205,
      longitude: -35.7330,
      phone: '(82) 3312-5580',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005794',
      name: 'USF São José',
      address: 'Rua Projetada',
      number: 's/n',
      neighborhood: 'Canaã',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.6152,
      longitude: -35.7480,
      phone: '(82) 3312-5585',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005840',
      name: 'UBS Gruta de Lourdes',
      address: 'Rua Hugo Corrêa Paes',
      number: 's/n',
      neighborhood: 'Gruta de Lourdes',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57052-560',
      latitude: -9.6220,
      longitude: -35.7510,
      phone: '(82) 3312-5520',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 4º Distrito Sanitário (Região da Lagoa / Bebedouro / Fernão Velho) ---
    {
      cnes: '3020738',
      name: 'UBS Geraldo Melo',
      address: 'Rua General Hermes',
      number: 's/n',
      neighborhood: 'Bom Parto',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57017-200',
      latitude: -9.6540,
      longitude: -35.7560,
      phone: '(82) 3312-5525',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005638',
      name: 'USF Dr. Antônio de Pádua',
      address: 'Rua Tobias Barreto',
      number: 's/n',
      neighborhood: 'Bebedouro',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57018-000',
      latitude: -9.6350,
      longitude: -35.7650,
      phone: '(82) 3312-5530',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005646',
      name: 'USF Edvaldo Silva',
      address: 'Rua Cel. Othon Bezerra de Melo',
      number: '01',
      neighborhood: 'Fernão Velho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57070-000',
      latitude: -9.5880,
      longitude: -35.7790,
      phone: '(82) 3312-5522',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005700',
      name: 'USF Rio Novo',
      address: 'Rua Tobias Barreto',
      number: 's/n',
      neighborhood: 'Rio Novo',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57071-000',
      latitude: -9.5750,
      longitude: -35.7920,
      phone: '(82) 3312-5532',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005719',
      name: 'USF Chã de Bebedouro',
      address: 'Rua Santo Antônio',
      number: 's/n',
      neighborhood: 'Chã de Bebedouro',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57018-400',
      latitude: -9.6250,
      longitude: -35.7710,
      phone: '(82) 3312-5534',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005727',
      name: 'USF Petrópolis',
      address: 'Rua Santa Rita',
      number: 's/n',
      neighborhood: 'Petrópolis',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57062-000',
      latitude: -9.6105,
      longitude: -35.7620,
      phone: '(82) 3312-5535',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 5º Distrito Sanitário (Jacintinho / Feitosa / Serraria) ---
    {
      cnes: '2005481',
      name: 'UBS José Araújo Silva',
      address: 'Rua Coronel Paranhos',
      number: 's/n',
      neighborhood: 'Jacintinho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57041-000',
      latitude: -9.6412,
      longitude: -35.7225,
      phone: '(82) 3315-5001',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005611',
      name: 'UBS Waldomiro Alencar',
      address: 'Travessa Cleto Campelo',
      number: 's/n',
      neighborhood: 'Jacintinho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57041-110',
      latitude: -9.6380,
      longitude: -35.7180,
      phone: '(82) 3312-5540',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005654',
      name: 'USF Dr. Paulo Leal',
      address: 'Rua Acre',
      number: '96',
      neighborhood: 'Feitosa',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57043-000',
      latitude: -9.6315,
      longitude: -35.7265,
      phone: '(82) 3312-5536',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005662',
      name: 'USF José Maria de Vasconcelos Neto',
      address: 'Rua Santa Madalena',
      number: '45',
      neighborhood: 'São Jorge',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57044-100',
      latitude: -9.6240,
      longitude: -35.7140,
      phone: '(82) 3312-5538',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005832',
      name: 'UBS José Tenório',
      address: 'Conjunto Residencial José Tenório',
      number: 's/n',
      neighborhood: 'Serraria',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57046-240',
      latitude: -9.6080,
      longitude: -35.7210,
      phone: '(82) 3312-5542',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 6º Distrito Sanitário (Benedito Bentes) ---
    {
      cnes: '2005530',
      name: 'UBS Dr. Hamilton Falcão',
      address: 'Avenida Cachoeira do Meirim',
      number: 's/n',
      neighborhood: 'Benedito Bentes',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57084-000',
      latitude: -9.5601,
      longitude: -35.7389,
      phone: '(82) 3315-5005',
      openingHours: 'Seg a Sex: 07:00 às 19:00',
    },
    {
      cnes: '2816873',
      name: 'UBS Dr. Arthur Ramos',
      address: 'Conjunto Henrique Equelman',
      number: 's/n',
      neighborhood: 'Benedito Bentes',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57085-000',
      latitude: -9.5490,
      longitude: -35.7340,
      phone: '(82) 3312-5548',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 7º Distrito Sanitário (Tabuleiro / Clima Bom / Santos Dumont / Cidade Universitária) ---
    {
      cnes: '2005565',
      name: 'UBS Dr. Djalma Loureiro',
      address: 'Rua Nilo Peçanha',
      number: 's/n',
      neighborhood: 'Clima Bom',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57071-100',
      latitude: -9.5850,
      longitude: -35.7680,
      phone: '(82) 3312-5552',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005786',
      name: 'USF Rosane Collor',
      address: 'Rua Waldemar Pedro da Silva',
      number: '28',
      neighborhood: 'Clima Bom',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57071-220',
      latitude: -9.5780,
      longitude: -35.7720,
      phone: '(82) 3312-5555',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2003317',
      name: 'USF Denisson Menezes',
      address: 'Conjunto Denisson Menezes',
      number: 's/n',
      neighborhood: 'Tabuleiro do Martins',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57081-385',
      latitude: -9.5710,
      longitude: -35.7590,
      phone: '(82) 3312-5557',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '6481132',
      name: 'USF Dr. João Macário de Omena Filho',
      address: 'Rua Onze de Agosto',
      number: 's/n',
      neighborhood: 'Santos Dumont',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57075-200',
      latitude: -9.5630,
      longitude: -35.7750,
      phone: '(82) 3312-5560',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '9000755',
      name: 'USF Marlene Fernandes Lanverly de Melo',
      address: 'Rua Manoel Afonso de Melo',
      number: 's/n',
      neighborhood: 'Santa Lúcia',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57082-000',
      latitude: -9.5695,
      longitude: -35.7485,
      phone: '(82) 3312-5562',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005824',
      name: 'USF Village Campestre I',
      address: 'Rua E',
      number: 's/n',
      neighborhood: 'Cidade Universitária',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57072-000',
      latitude: -9.5520,
      longitude: -35.7820,
      phone: '(82) 3312-5565',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 8º Distrito Sanitário (Litoral Norte de Maceió) ---
    {
      cnes: '2005512',
      name: 'UBS Maria Conceição Fonseca Paranhos',
      address: 'Avenida Comendador Gustavo Paiva',
      number: 's/n',
      neighborhood: 'Jacarecica',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57038-000',
      latitude: -9.6052,
      longitude: -35.6881,
      phone: '(82) 3315-5004',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009684',
      name: 'USF Lourença de Carvalho (Riacho Doce)',
      address: 'Rua da Praia',
      number: 's/n',
      neighborhood: 'Riacho Doce',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57039-500',
      latitude: -9.5760,
      longitude: -35.6530,
      phone: '(82) 3312-5570',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009714',
      name: 'USF Pescaria',
      address: 'Rodovia AL-101 Norte',
      number: 'km 14',
      neighborhood: 'Pescaria',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57039-800',
      latitude: -9.5480,
      longitude: -35.6290,
      phone: '(82) 3312-5572',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009897',
      name: 'USF David Nasser (Ipioca)',
      address: 'Rua Almirante Tamandaré',
      number: 's/n',
      neighborhood: 'Ipioca',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57039-900',
      latitude: -9.5130,
      longitude: -35.5960,
      phone: '(82) 3312-5575',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
  ];

  const ubsIds: string[] = [];
  for (const ubs of ubssData) {
    const created = await prisma.ubs.create({ data: ubs });
    ubsIds.push(created.id);
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

  // 5. Cidadãos e cadernetas com registros espalhados pelos últimos 12 meses
  console.log('📒 Criando cidadãos e registros de vacinação...');
  const vaccines = await prisma.vaccine.findMany({
    include: { doses: { orderBy: { doseNumber: 'asc' } } },
  });
  const dosesByVaccine = new Map(vaccines.map((v) => [v.name, v.doses]));
  const vaccineIndex = new Map(vaccines.map((v, i) => [v.name, i + 1]));

  let recordsCount = 0;

  for (const [index, entry] of CITIZENS.entries()) {
    const number = String(index + 1).padStart(2, '0');
    const profile = PROFILES[entry.profile];
    // Deslocamento determinístico (0 a 16 dias) para variar as datas sem mudar o status esperado
    const shift = (index % 5) * 4;

    const created = await prisma.user.create({
      data: {
        name: entry.name,
        email: `cidadao${number}@vacinei.com.br`,
        passwordHash: defaultPasswordHash,
        ...privacyConsent,
        cpf: generateCpf(600000000 + index + 1),
        phone: `829888800${number}`,
        birthDate: profile.bornDaysAgo !== undefined
          ? daysAgo(profile.bornDaysAgo - shift)
          : new Date(profile.birthDate!),
        role: UserRole.CIDADAO,
        isActive: true,
      },
    });

    let recordIndex = 0;
    for (const [vaccineName, appliedDaysAgo] of Object.entries(profile.vaccines)) {
      const doses = dosesByVaccine.get(vaccineName);
      if (!doses) throw new Error(`Vacina não encontrada no seed: ${vaccineName}`);

      for (const [doseIdx, days] of appliedDaysAgo.entries()) {
        const kind = (index + recordIndex) % 4;
        const isPresencial = kind <= 1;
        const origin = isPresencial
          ? RecordOrigin.SISTEMA_PRESENCIAL
          : kind === 2
            ? RecordOrigin.MANUAL
            : RecordOrigin.OCR_ICR;

        const applicationDate = daysAgo(Math.max(days - shift, 1));

        await prisma.vaccinationRecord.create({
          data: {
            userId: created.id,
            doseId: doses[doseIdx].id,
            applicationDate,
            confirmedAt: isPresencial ? applicationDate : null,
            status: isPresencial ? VaccineStatus.CONFIRMADO : VaccineStatus.EM_DIA,
            origin,
            ocrConfidence: origin === RecordOrigin.OCR_ICR ? 0.82 + (recordIndex % 3) * 0.05 : null,
            lotNumber: `LT${String(vaccineIndex.get(vaccineName)).padStart(2, '0')}${number}${doseIdx + 1}`,
            appliedById: isPresencial ? professional.id : null,
            ubsId: isPresencial ? ubsIds[(index * 3 + recordIndex) % ubsIds.length] : null,
          },
        });

        recordIndex++;
        recordsCount++;
      }
    }
  }

  console.log(`✅ ${CITIZENS.length} cidadãos e ${recordsCount} registros de vacinação criados.`);

  // 6. Cadernetas dos profissionais (D11): o profissional também é cidadão.
  // Mariana só tem registros próprios (MANUAL/OCR), para testar o 403 do RS006 ao tentar confirmá-los;
  // Paulo tem doses confirmadas pela Mariana, que é verificada.
  const professionalRecords: {
    userId: string;
    vaccine: string;
    doseIdx: number;
    days: number;
    origin: RecordOrigin;
  }[] = [
    { userId: professional.id, vaccine: 'Tríplice Viral (SCR)', doseIdx: 0, days: 200, origin: RecordOrigin.MANUAL },
    { userId: professional.id, vaccine: 'Tríplice Viral (SCR)', doseIdx: 1, days: 170, origin: RecordOrigin.MANUAL },
    { userId: professional.id, vaccine: 'Influenza (Gripe)', doseIdx: 0, days: 40, origin: RecordOrigin.OCR_ICR },
    { userId: unverifiedProfessional.id, vaccine: 'Hepatite B', doseIdx: 0, days: 90, origin: RecordOrigin.SISTEMA_PRESENCIAL },
    { userId: unverifiedProfessional.id, vaccine: 'Influenza (Gripe)', doseIdx: 0, days: 30, origin: RecordOrigin.SISTEMA_PRESENCIAL },
    { userId: unverifiedProfessional.id, vaccine: 'Febre Amarela', doseIdx: 0, days: 400, origin: RecordOrigin.MANUAL },
  ];

  for (const [i, entry] of professionalRecords.entries()) {
    const doses = dosesByVaccine.get(entry.vaccine);
    if (!doses) throw new Error(`Vacina não encontrada no seed: ${entry.vaccine}`);

    const isPresencial = entry.origin === RecordOrigin.SISTEMA_PRESENCIAL;
    const applicationDate = daysAgo(entry.days);

    await prisma.vaccinationRecord.create({
      data: {
        userId: entry.userId,
        doseId: doses[entry.doseIdx].id,
        applicationDate,
        confirmedAt: isPresencial ? applicationDate : null,
        status: isPresencial ? VaccineStatus.CONFIRMADO : VaccineStatus.EM_DIA,
        origin: entry.origin,
        ocrConfidence: entry.origin === RecordOrigin.OCR_ICR ? 0.88 : null,
        lotNumber: `LTP${String(i + 1).padStart(2, '0')}`,
        appliedById: isPresencial ? professional.id : null,
        ubsId: isPresencial ? ubsIds[i % ubsIds.length] : null,
      },
    });
  }

  console.log(`✅ ${professionalRecords.length} registros de vacinação nas cadernetas dos profissionais.`);
  console.log(`🔑 Senha de todos os usuários de teste: ${DEFAULT_PASSWORD}`);
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
