import { buildStudentContext } from '../lib/studentContext';

// Profile 1: Building Technology Student
const buildingTechProfile = {
  name: 'Tunde Adebayo',
  department: 'Building Technology',
  level: '300L / Year 3',
  university: 'University of Lagos'
};

const buildingTechCourses = [
  { code: 'BLD301', title: 'Advanced Construction Technology', units: 3 },
  { code: 'BLD303', title: 'Structural Mechanics & Timber Design', units: 3 },
  { code: 'BLD305', title: 'Measurement & Quantity Surveying', units: 2 },
  { code: 'BLD307', title: 'Building Services & Geotechnical Site Engineering', units: 3 }
];

// Profile 2: Law Student
const lawProfile = {
  name: 'Chioma Okeke',
  department: 'Law',
  level: '400L / Year 4',
  university: 'University of Ibadan'
};

const lawCourses = [
  { code: 'LAW401', title: 'Jurisprudence & Legal Theory', units: 4 },
  { code: 'LAW403', title: 'Law of Evidence & Procedure', units: 4 },
  { code: 'LAW405', title: 'Commercial & Corporate Law', units: 3 },
  { code: 'LAW407', title: 'International Humanitarian Law', units: 3 }
];

console.log('######################################################################');
console.log('SAMPLE 1: BUILDING TECHNOLOGY STUDENT CONTEXT');
console.log('######################################################################\n');
console.log(buildStudentContext(buildingTechProfile, buildingTechCourses));

console.log('\n\n######################################################################');
console.log('SAMPLE 2: LAW STUDENT CONTEXT');
console.log('######################################################################\n');
console.log(buildStudentContext(lawProfile, lawCourses));
