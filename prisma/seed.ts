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
      address: 'Rua Mizael Domingos',
      number: '241',
      neighborhood: 'Centro',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57020-600',
      latitude: -9.6657584,
      longitude: -35.7326256,
      phone: '(82) 3312-5460',
      openingHours: 'Seg a Sex: 07:00 às 19:00',
    },
    {
      cnes: '2009722',
      name: 'UBS Dr. Osvaldo Brandão Vilela',
      address: 'Rua Lafaete Pacheco',
      number: '325',
      neighborhood: 'Ponta da Terra',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.6622989,
      longitude: -35.7186368,
      phone: '(82) 3312-5498',
      openingHours: 'Seg a Sex: 07:00 às 21:00',
    },
    {
      cnes: '2009706',
      name: 'USF Reginaldo',
      address: 'Rua Diegues Júnior',
      number: '220',
      neighborhood: 'Poço',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57025-650',
      latitude: -9.6521757,
      longitude: -35.728426,
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
      zipCode: '57014-740',
      latitude: -9.6626705,
      longitude: -35.754364,
      phone: '(82) 3312-5503',
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
      zipCode: '57010-000',
      latitude: -9.6894204,
      longitude: -35.7591248,
      phone: '(82) 3312-5507',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009870',
      name: 'USF Prof. Durval Cortez',
      address: 'Rua João Lúcio Marques',
      number: '64',
      neighborhood: 'Prado',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57010-150',
      latitude: -9.67059,
      longitude: -35.74658,
      phone: '(82) 3312-5505',
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
      zipCode: '57014-600',
      latitude: -9.611337,
      longitude: -35.7398621,
      phone: '(82) 3312-5502',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '7008023',
      name: 'USF José Guedes de Farias',
      address: 'Conjunto Medeiros Neto',
      number: '3',
      neighborhood: 'Santa Amélia',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57063-640',
      latitude: -9.591684,
      longitude: -35.7350063,
      phone: '(82) 3312-5528',
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
      zipCode: '57052-020',
      latitude: -9.6415791,
      longitude: -35.7340622,
      phone: '(82) 3312-5516',
      openingHours: 'Seg a Sex: 07:00 às 18:00',
    },
    {
      cnes: '2003325',
      name: 'UBS Dr. Aliomar Almeida Lins',
      address: 'Loteamento Bela Vista II',
      number: 's/n',
      neighborhood: 'Benedito Bentes II',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57084-040',
      latitude: -9.56344,
      longitude: -35.72431,
      phone: '(82) 3312-5549',
      openingHours: 'Seg a Sex: 07:00 às 16:30',
    },
    {
      cnes: '9306471',
      name: 'UBS Maria Tereza Holanda Costa',
      address: 'Rua Padre Cícero',
      number: '224',
      neighborhood: 'Ouro Preto',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57045-815',
      latitude: -9.60406,
      longitude: -35.73144,
      phone: null,
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005638',
      name: 'USF São José',
      address: 'Rua Maragogi',
      number: 's/n',
      neighborhood: 'Canaã',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-110',
      latitude: -9.6207999,
      longitude: -35.73912,
      phone: '(82) 3312-5513',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 4º Distrito Sanitário (Região da Lagoa / Bebedouro / Fernão Velho) ---
    {
      cnes: '3020738',
      name: 'UBS Geraldo Melo',
      address: 'Rua do Campo',
      number: 's/n',
      neighborhood: 'Bom Parto',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57017-235',
      latitude: -9.64921,
      longitude: -35.74615,
      phone: '(82) 3312-5525',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '9940499',
      name: 'USF Dr. Antônio de Pádua',
      address: 'Rua Alameda Carmelita Omena de Farias',
      number: 's/n',
      neighborhood: 'Petrópolis',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57062-180',
      latitude: -9.6075415,
      longitude: -35.735,
      phone: '(82) 3312-5530',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005646',
      name: 'USF Edvaldo Silva',
      address: 'Rua Coronel Othon Bezerra de Melo',
      number: '1',
      neighborhood: 'Fernão Velho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57070-110',
      latitude: -9.5909329,
      longitude: -35.7769775,
      phone: '(82) 3312-5522',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005549',
      name: 'Unidade de Saúde Dr. Cláudio Medeiros (Rio Novo)',
      address: 'Rua São Luís',
      number: 's/n',
      neighborhood: 'Rio Novo',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57070-630',
      latitude: -9.6110363,
      longitude: -35.8088844,
      phone: '(82) 3312-5523',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '3821994',
      name: 'Unidade Básica de Saúde Bebedouro',
      address: 'Rua Doutor Oswaldo Cruz',
      number: '170',
      neighborhood: 'Chã de Bebedouro',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.6212972,
      longitude: -35.7582681,
      phone: '(82) 3312-5534',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 5º Distrito Sanitário (Jacintinho / Feitosa / Serraria) ---
    {
      cnes: '2005689',
      name: 'UBS José Araújo Silva',
      address: 'Rua Pastor Eurico Calheiros',
      number: 's/n',
      neighborhood: 'Jacintinho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57041-620',
      latitude: -9.6362184,
      longitude: -35.7206454,
      phone: '(82) 3312-5530',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005611',
      name: 'UBS Waldomiro Alencar',
      address: 'Rua Júlio Alto',
      number: '4316',
      neighborhood: 'Jacintinho',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57040-340',
      latitude: -9.6501861,
      longitude: -35.719986,
      phone: '(82) 3312-5537',
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
      zipCode: '57043-230',
      latitude: -9.6447678,
      longitude: -35.7300879,
      phone: '(82) 3312-5536',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005891',
      name: 'USF José Maria de Vasconcelos Neto',
      address: 'Rua Santa Madalena',
      number: '45',
      neighborhood: 'São Jorge',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57041-170',
      latitude: -9.6318462,
      longitude: -35.7172861,
      phone: '(82) 3312-5538',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005832',
      name: 'UBS José Tenório',
      address: 'Conjunto José Tenório de A Lins',
      number: 's/n',
      neighborhood: 'Serraria',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57043-000',
      latitude: -9.6026952,
      longitude: -35.7350063,
      phone: '(82) 3312-5533',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 6º Distrito Sanitário (Benedito Bentes) ---
    {
      cnes: '2005530',
      name: 'UBS Dr. Hamilton Falcão',
      address: 'Avenida Norma Pimentel da Costa',
      number: 's/n',
      neighborhood: 'Benedito Bentes I',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57084-040',
      latitude: -9.5504379,
      longitude: -35.7262068,
      phone: '(82) 3315-5422',
      openingHours: 'Seg a Sex: 07:00 às 19:00',
    },
    {
      cnes: '2816873',
      name: 'UBS Dr. Arthur Ramos',
      address: 'Rua J Quadra II Conjunto Equelman',
      number: 's/n',
      neighborhood: 'Tabuleiro',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.5971242,
      longitude: -35.7340837,
      phone: '(82) 3312-5548',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 7º Distrito Sanitário (Tabuleiro / Clima Bom / Santos Dumont / Cidade Universitária) ---
    {
      cnes: '2005565',
      name: 'UBS Dr. Djalma Loureiro',
      address: 'Rua Muniz Falcão',
      number: 's/n',
      neighborhood: 'Clima Bom',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57071-130',
      latitude: -9.6452338,
      longitude: -35.7809778,
      phone: '(82) 3312-5553',
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
      zipCode: '57071-180',
      latitude: -9.580532,
      longitude: -35.7344913,
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
      zipCode: '57020-480',
      latitude: -9.5441295,
      longitude: -35.7284832,
      phone: '(82) 3312-5557',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '6481132',
      name: 'USF Dr. João Macário de Omena Filho',
      address: 'Avenida Corintho Campelo da Paz',
      number: 's/n',
      neighborhood: 'Santos Dumont',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.5484216,
      longitude: -35.7351351,
      phone: '(82) 3312-5556',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '0466972',
      name: 'USF Marlene Fernandes Lanverly de Melo',
      address: 'Rua Padre Cícero',
      number: '386',
      neighborhood: 'Santa Lúcia',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.6384761,
      longitude: -35.7442654,
      phone: '(82) 3312-5562',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2005824',
      name: 'USF Village Campestre I',
      address: 'Rua Celina Sacramento Silva',
      number: 's/n',
      neighborhood: 'Cidade Universitária',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57073-200',
      latitude: -9.5520187,
      longitude: -35.7557012,
      phone: '(82) 3312-5566',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },

    // --- 8º Distrito Sanitário (Litoral Norte de Maceió) ---
    {
      cnes: '6898521',
      name: 'UBS Maria Conceição Fonseca Paranhos',
      address: 'Conjunto Alfredo Gaspar de Mendonça',
      number: '1',
      neighborhood: 'Jacarecica',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57080-000',
      latitude: -9.6137327,
      longitude: -35.6933784,
      phone: '(82) 3312-5573',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009684',
      name: 'Unidade Básica de Saúde Vanderli Maria de Andrade (Riacho Doce)',
      address: 'Rua Américo Vasco com Avenida Luiz de F Albuquerque',
      number: 's/n',
      neighborhood: 'Riacho Doce',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57030-000',
      latitude: -9.6184323,
      longitude: -35.6708908,
      phone: '(82) 3315-5383',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009714',
      name: 'USF Pescaria',
      address: 'Rua Irene Cavalcante da Silva',
      number: '13',
      neighborhood: 'Pescaria',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57039-640',
      latitude: -9.5865924,
      longitude: -35.7276729,
      phone: '(82) 3312-5568',
      openingHours: 'Seg a Sex: 07:00 às 17:00',
    },
    {
      cnes: '2009897',
      name: 'USF David Nasser (Ipioca)',
      address: 'Rua da Igreja',
      number: '163',
      neighborhood: 'Ipioca',
      city: 'Maceió',
      state: 'AL',
      zipCode: '57030-000',
      latitude: -9.5768499,
      longitude: -35.6083538,
      phone: '(82) 3312-5571',
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
