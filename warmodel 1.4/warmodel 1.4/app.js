//warModel 1.6
console.log("starting...");

const fs = require("fs")

console.log("reading file...")

//name of file we want to process
//const fileName = "mesh_all.spk"//DIFFERENT FORMAT, DOES NOT WORK
const fileName = "modelesshowroom.spk"//arsenal model
//const fileName = "modelesvilles.spk"//buildings
//const fileName = "modelesindustries.spk"//more buildings

const data = fs.readFileSync(fileName);//read file in to a buffer
console.log("done")

console.log("reading header...")//process the header

if (data.toString("ASCII", 0x00, 0x08) != "MESHPCPC") {//check if the file starts with meshpcpc
	throw ("header check failed.")
}
//read the header of the file in to a object 
var header = { triangleOffset: 0, vertexOffset: 0, indexStartOffset: 0, indexEndOffset: 0 }

header.vertexOffset = data.readUInt32LE(0xA8)//offset for the vertex portion
header.indexEndOffset = data.readUInt32LE(0x40)//un verified

//file index
header.indexStartOffset = data.readUInt32LE(0x34)
header.indexLength = data.readUInt32LE(0x38)
header.indexElements = data.readUInt32LE(0x3C)

//data type descriptor
header.dataDescriptorOffset = data.readUInt32LE(0x40)
header.dataDescriptorLength = data.readUInt32LE(0x44)
header.dataDescriptorItems = data.readUInt32LE(0x48)

//EUG0 (ndfbin format????)
header.eug0Offset = data.readUInt32LE(0x4c)
header.eug0Length = data.readUInt32LE(0x50)

//mesh allocation table header
header.meshTableHeader = { offset: data.readUInt32LE(0x70), size: data.readUInt32LE(0x74), items: data.readUInt32LE(0x78)}

//mesh allocation table
header.meshTable = { offset: data.readUInt32LE(0x7C), siz: data.readUInt32LE(0x80), items: data.readUInt32LE(0x84)}

//triangle index/offset table 
//header.offestTableOffset = data.readUInt32LE(0x88)//OLD
header.triangleOffsetTable = { offset: data.readUInt32LE(0x88), size: data.readUInt32LE(0x8C), items: data.readUInt32LE(0x90)}

//triangle data
header.triangleOffset = data.readUInt32LE(0x94)
header.triangleLength = data.readUInt32LE(0x98)

//vertex offset table
//header.vertexOffsetTableOffset = data.readUInt32LE(0x9C)//old
header.vertexOffsetTable = { offset: data.readUInt32LE(0x9C), size: data.readUInt32LE(0xA0), items: data.readUInt32LE(0xA4)}

//read the index
console.log("reading index...")

var i = header.indexStartOffset
var path = []
var folderEnds = []
var files = []

//this currently only seems to work on modelesshowroom and not modelesvilles
while (files.length < header.indexElements) {
//while (i < header.indexLength || files.length < header.indexElements) {
	//read the 2 intigers at the start of the index entry
	let firstInt = data.readUInt32LE(i)
	let secondInt = data.readUInt32LE(i + 4)

	if (firstInt != 0) {//if first int is non zero it is the length of a folder
		let folderName = data.toString("ASCII", i + 8, i + firstInt - 1)//get the folders name, the minus 1 is so we dont save the null terminator
		path.push(folderName)//add the folders name to our current path
		folderEnds.push(secondInt + i)//save the folders end offset for later
		i += firstInt//go to the next folder/file
	} else {//if first int is zero it denotes a file
		let fileDataEndOffset = i + 8;
		while (data.toString("hex", fileDataEndOffset, fileDataEndOffset + 2) != "cdcd") {//look through the file for the name separator while reading the bytes
			fileDataEndOffset++
		}
		let fileData = data.subarray(i + 8, fileDataEndOffset)//save the data

		let fileNameEndOffset = fileDataEndOffset + 2//+2 to skip passed the separator
		while (data.toString("hex", fileNameEndOffset, fileNameEndOffset + 1) != "00") {//look throudh the name untill the next null terminator
			fileNameEndOffset++
		}
		let fileName = data.toString("ASCII", fileDataEndOffset + 2, fileNameEndOffset)//save the file name
		let fullName = path.join("") + fileName
		files.push(JSON.parse(JSON.stringify({ "name": fullName, "content": fileData, "id": data.readUInt16LE(fileDataEndOffset - 2) })))//save all the file info
		//json.parese is to clone the object so we dont just push a reference to the files array
		if (secondInt != 0) {//if the second int was not zero there are more files in this folder
			i += secondInt//set i to the location of the next file
		}
		else {//if the second int was zero we reached the end of a folder
			let returnOffset = folderEnds.pop()
			if (returnOffset > i) {//make sure we dont go backwards?
				i = returnOffset//go to the start of the next folder/fill
			}
			path.pop()//remove the last item from the path array
		}
	}
}

//check how may items we read against the header
if (files.length != header.indexElements) {
	throw ("ERROR, read files not equal to index, found " + files.length + " expected " + header.indexElements)
}

//read mesh allocation table
var meshAllocationTable = []
for (i = 0; i < header.meshTable.items; i++) {//for each file
	localOffset = header.meshTable.offset + i * 12
	meshAllocationTable.push({ id: data.readUInt16LE(localOffset + 0), textureID: data.readUInt16LE(localOffset + 2), triangleID: data.readUInt16LE(localOffset + 4), vertexID: data.readUInt16LE(localOffset + 6) })
}
//print out the mesh allocation table and write it to a file
var fileString = fileName + " mesh allocation table\n"
var lastId = -1
for (i = 0; i < meshAllocationTable.length; i++) {//for each entry in the tables index
	if (lastId != meshAllocationTable[i].id) {//if the current id is different than the last one we need to print a new file name, could use the mesh table index instead
		fileString += cleanFileName(files[meshAllocationTable[i].id].name) + "\n"
	}
	lastId = meshAllocationTable[i].id
	fileString += "\tsubmesh" + "_V" + meshAllocationTable[i].vertexID + "_I" + meshAllocationTable[i].triangleID + "_T" + meshAllocationTable[i].textureID + "\n"
}
console.log(fileString)
fs.writeFileSync(fileName + " mesh allocation table.txt", fileString)//write to file

//read triangle offset table
var triangleOffsetTable = []//not to be confused with header.triangleOffsetTable
for (i = 0; i < header.triangleOffsetTable.items; i++) {//read all of the triangle indicie offsets in to a object
	let localOffset = header.triangleOffsetTable.offset + i * 16
	triangleOffsetTable.push({ id: i, offset: data.readUInt32LE(localOffset), length: data.readUInt32LE(localOffset + 4), numInts: data.readUInt32LE(localOffset + 8), type: data.readUInt32LE(localOffset + 12), largestIndex:0})
	//the last value is called type because it is consistent between entries and i have no idea what it does, for triangle indicie offsets it is allways 1
}

//read vertex offset table
var vertexOffsetTable = []//not to be confused with header.vertexOffsetTable
for (i = 0; i < header.vertexOffsetTable.items; i++) {//read all of the triangle indicie offsets in to a object
	let localOffset = header.vertexOffsetTable.offset + i * 16
	vertexOffsetTable.push({ id: i, offset: data.readUInt32LE(localOffset), length: data.readUInt32LE(localOffset + 4), numVerts: data.readUInt32LE(localOffset + 8), type: data.readUInt32LE(localOffset + 12) })
	//the last value is called type because it is consistent between entries and i have no idea what it does, for triangle indicie offsets it is allways 1
}

//put verticeis in to object
var verticies = []
for (i = 0; i < vertexOffsetTable.length; i ++) {//for each entry in the vertex offset table
	verticies.push({ id: i, pos: [], uvs: [], normal: [] })
	//let localOffset = vertexOffsetTable[i].offset
	for (j = 0; j < vertexOffsetTable[i].numVerts; j++) {
		let localOffset = header.vertexOffset + vertexOffsetTable[i].offset + j * 24
		//position data
		verticies[i].pos.push({ n: j, x: data.readFloatLE(localOffset + 0), y: data.readFloatLE(localOffset + 8), z: data.readFloatLE(localOffset + 4) })//note in the file the verticies are stored in the X Z Y format

		//UV data
		//these values were found by guessing and checking in blender, there is probably a better way of doing this.
		let u = data.readIntLE(localOffset + 16, 2) / 0x1fff//this value maps it to the full range in unity
		let v = data.readIntLE(localOffset + 18, 2) / 0x1fff
		let uOffset = Math.abs(data.readIntLE(localOffset + 20, 1) / 0xff)//maps it from zero to one
		let vOffset = Math.abs(data.readIntLE(localOffset + 21, 1) / 0xff)
		let uSize = Math.abs(data.readIntLE(localOffset + 22, 1) / 0xff)
		let vSize = Math.abs(data.readIntLE(localOffset + 23, 1) / 0xff)
		//this may be scale / offset from center or some BS i dont know how to translate it for both model types, this works for one with quadrants
		//apply scale
		u = u * uSize
		v = v * -vSize
		//apply translation
		u = u + uOffset
		v = v - vOffset + 0.5025
		verticies[i].uvs.push({ n: j, u: u, v: v })

		//normals (EXPERIMENTAL)
		//verticies[i].normal.push({ n: j, x: data.readInt8(localOffset + 12), y: data.readInt8(localOffset + 14), z: data.readInt8(localOffset + 13) })
		let nx = data.readInt8(localOffset + 12)
		let ny = data.readInt8(localOffset + 14)
		let nz = data.readInt8(localOffset + 13)
		//turn normals in to a unit vetor ( u^ = u/|u| )
		let mag = Math.sqrt(Math.abs(nx * nx ) + Math.abs(ny * ny) + Math.abs(nz * nz))
		let unx = nx/mag
		let uny = ny/mag
		let unz = nz/mag
		verticies[i].normal.push({ n: j, x: unx, y: uny, z: unz })
		//this seems to work however the normals need to be flipped in blender,
		//i have not found a way to fix this, inverting each component does not seem to work
	}
}

var indicies = []
for (i = 0; i < triangleOffsetTable.length; i++) {//for each entry in the triangle offset table
	indicies.push({ id: i, indicies: []})
	//let localOffset = triangleOffsetTable[i].offset
	for (j = 0; j < triangleOffsetTable[i].numInts / 3; j++) {
		let localOffset = header.triangleOffset + triangleOffsetTable[i].offset + j * 6
		indicies[i].indicies.push({ n: j, a: data.readUInt16LE(localOffset + 0), b: data.readUInt16LE(localOffset + 2), c: data.readUInt16LE(localOffset + 4) })
	}
	//this finds the highest index for debug purposes
	var largest = 0
	for (j = 0; j < triangleOffsetTable[i].numInts; j++) {
		let localOffset = header.triangleOffset + triangleOffsetTable[i].offset + j * 2
		if (data.readUInt16LE(localOffset) > largest) { largest = data.readUInt16LE(localOffset)}
	}
	triangleOffsetTable[i].largestIndex = largest 
}

//submesh finder
var subMeshes = []//submeshes are unique more than one file names can reference the same submesh
for (i = 0; i < meshAllocationTable.length; i++) {//this finds unique combinatios of vertex id, indicie id and texture id.
	let newSubmesh = { name: "", vertexID: meshAllocationTable[i].vertexID, indicieID: meshAllocationTable[i].triangleID, textureID: meshAllocationTable[i].textureID, verticies: [], uvs: [], triangles: [], normals: [] }//define our new submesh
	newSubmesh.name = "submesh" + "_V" + meshAllocationTable[i].vertexID + "_I" + meshAllocationTable[i].triangleID + "_T" + meshAllocationTable[i].textureID//the submeshes name includes all the ids
	//check if it already exists
	exists = false
	for (j = 0; j < subMeshes.length; j++) {
		if ((subMeshes[j].vertexID == newSubmesh.vertexID && subMeshes[j].triangleID == newSubmesh.triangleID && subMeshes[j].textureID == newSubmesh.textureID)) {//if this submesh already exists
			exists = true 
			break;
		}
	}
	if (!exists) {//if it does not already exist
		subMeshes.push(newSubmesh)//add it
	}
}

//populate submeshes with the apporpriate vetex/indicie data depending on the ids then export it as a wavefront
for (i = 0; i < subMeshes.length; i++) {
	subMeshes[i].verticies = verticies[subMeshes[i].vertexID].pos
	subMeshes[i].uvs = verticies[subMeshes[i].vertexID].uvs
	subMeshes[i].triangles = indicies[subMeshes[i].indicieID].indicies
	subMeshes[i].normals = verticies[subMeshes[i].vertexID].normal
	generateWavefront(subMeshes[i])
}

//janky wavefront(obj) exporter
function generateWavefront(input) {
	console.log("generating .obj file")
	const dp = 4//i dont know if you are supposed to round to 4 dp or not, but the examples were.
	var wavefrontFile = "#Exported form warmodel v1.5\n#input file: " + fileName + "\n#verticeis: " + (input.vertLength / 24) + " faces: " + (input.triangleLength / 6) + "\n#verticeis\n"//add nice header
	for (let i = 0; i < input.verticies.length; i++) {//add vertex data
		wavefrontFile += "v  " + input.verticies[i].x.toFixed(dp) + " " + input.verticies[i].y.toFixed(dp) + " " + input.verticies[i].z.toFixed(dp) + "\n"
	}
	wavefrontFile += "#uvs\n"
	for (let i = 0; i < input.uvs.length; i++) {//add uv data
		wavefrontFile += "vt  " + input.uvs[i].u + " " + input.uvs[i].v + "\n"
	}

	wavefrontFile += "#normals\n"
	for (let i = 0; i < input.uvs.length; i++) {//add normal data
		wavefrontFile += "vn  " + input.normals[i].x + " " + input.normals[i].y + " " + input.normals[i].z + " " + "\n"
	}

	wavefrontFile += "#faces\n"
	let first = true
	for (let i = 0; i < input.triangles.length; i++) {//add face data
		//wavefront triangle indicies starts AT 1 NOT 0!!!!!!!!!!!!!!
		//wavefrontFile += "f  " + (input.triangles[i].a+1) + " " + (input.triangles[i].b+1) + " " + (input.triangles[i].c+1) + "\n"//no uvs
		wavefrontFile += "f  " + (input.triangles[i].a + 1) + "/" + (input.triangles[i].a + 1) + " " + (input.triangles[i].b + 1) + "/" + (input.triangles[i].b + 1) + " " + (input.triangles[i].c + 1) + "/" + (input.triangles[i].c + 1) + "\n"//with uvs
	}
	//getting the last part of the name without any null characters is a little fucked
	console.log("saving file \"" + input.name.split("\\")[input.name.split("\\").length - 1].replace(/\0/g, '') + "\"...")
	fs.writeFileSync(input.name.split("\\")[input.name.split("\\").length - 1].replace(/\0/g, '') + ".obj", wavefrontFile)//write to file
	console.log("done.")
	return
}

function cleanFileName(fileName) {//removes any problematic characters from the file name
	return (fileName.split("\\")[fileName.split("\\").length - 1].replace(/\0/g, ''))
}
